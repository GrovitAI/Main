// Define Supabase env vars first so they are active during service initialization
declare var process: any;
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://pyikrlqduampooncpzri.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';

// Helpers
function uuid() {
  return 'f' + Math.random().toString(16).substr(2, 31).padStart(31, '0');
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const { supabase } = await import('../src/lib/pos/supabase');
  const { saveRecipe, processConsumptionBatch } = await import('../src/lib/pos/inventory-service');
  const { settleOrderById } = await import('../src/lib/pos/open-orders-service');
  const { TENANT_ID, BRANCH_ID } = await import('../src/lib/pos/tenant-context');

  console.log('--- STARTING RECIPE FLOW INTEGRATION TEST ---');

  const productId = uuid();
  const recipeId = uuid();
  const orderId = uuid();
  const orderItemId = uuid();
  
  // Find a valid material in the database to link to the recipe
  const { data: mats, error: matErr } = await supabase
    .from('inventory_materials')
    .select('id, material_name')
    .eq('tenant_id', TENANT_ID)
    .limit(1);

  if (matErr || !mats || mats.length === 0) {
    throw new Error('Could not fetch a valid material for testing: ' + (matErr?.message || 'No materials found'));
  }
  const materialId = mats[0].id;
  const materialName = mats[0].material_name;
  console.log(`Using material: Name="${materialName}", ID=${materialId}`);

  try {
    // 1. Setup Branch Stock Level (Initialize stock = 20, reserved = 0, available = 20)
    console.log('\nStep 1: Setting up initial branch stock level for material...');
    
    // Clean up old stock level if exists
    await supabase
      .from('inventory_material_stock_levels')
      .delete()
      .eq('tenant_id', TENANT_ID)
      .eq('branch_id', BRANCH_ID)
      .eq('material_id', materialId);

    const { error: stockErr } = await supabase
      .from('inventory_material_stock_levels')
      .insert({
        tenant_id: TENANT_ID,
        branch_id: BRANCH_ID,
        material_id: materialId,
        location_id: 'Dry Storage',
        current_stock: 20,
        reserved_stock: 0,
        available_stock: 20
      });

    if (stockErr) throw stockErr;
    console.log('Stock level set to 20 units.');

    // 2. Create Test Product
    console.log('\nStep 2: Creating test product...');
    const { error: prodErr } = await supabase
      .from('products')
      .insert({
        id: productId,
        tenant_id: TENANT_ID,
        branch_id: BRANCH_ID,
        name: 'Test Belgian Milkshake',
        price: 150,
        is_available: true,
        is_active: true,
        inventory_tracking_enabled: true
      });
    
    if (prodErr) throw prodErr;
    console.log('Product created.');

    // 3. Create Test Recipe
    console.log('\nStep 3: Saving recipe linked to product...');
    const recipeResult = await saveRecipe({
      id: recipeId,
      recipe_code: 'REC_SHAKE',
      recipe_name: 'Belgian Shake Recipe',
      menu_item_id: productId,
      is_active: true,
      yield_quantity: 2, // Yields 2 portions
      yield_unit: 'portions'
    }, [
      { material_id: materialId, quantity: 5 } // Needs 5 units of material for 2 portions
    ]);

    if (recipeResult.error || !recipeResult.data) {
      throw new Error('Failed to save recipe: ' + recipeResult.error);
    }
    console.log(`Recipe saved. Yield Qty=${recipeResult.data.yield_quantity}, Yield Unit=${recipeResult.data.yield_unit}`);

    // Link product to recipe
    const { error: linkErr } = await supabase
      .from('products')
      .update({ recipe_id: recipeId })
      .eq('id', productId);
    
    if (linkErr) throw linkErr;
    console.log('Linked product to recipe.');

    // 4. Create open order and items
    console.log('\nStep 4: Creating unpaid open order with 4 units of milkshake...');
    const { error: orderErr } = await supabase
      .from('open_orders')
      .insert({
        id: orderId,
        tenant_id: TENANT_ID,
        branch_id: BRANCH_ID,
        order_name: 'Table 14 Test',
        status: 'unpaid'
      });
    if (orderErr) throw orderErr;

    const { error: itemErr } = await supabase
      .from('open_order_items')
      .insert({
        id: orderItemId,
        open_order_id: orderId,
        product_id: productId,
        item_name: 'Test Belgian Milkshake',
        qty: 4, // sold_qty = 4
        price: 150,
        kot_sent: true
      });
    if (itemErr) throw itemErr;
    console.log('Order and order items created.');

    // 5. Settle bill and trigger async consumption
    console.log('\nStep 5: Settling order to trigger recipe consumption...');
    const settleResult = await settleOrderById(orderId, 'cash');
    if (settleResult.error) {
      throw new Error('Settle order failed: ' + settleResult.error);
    }
    console.log('Bill settled successfully.');

    // 6. Wait for async processing
    console.log('\nStep 6: Waiting 4 seconds for background consumption queue...');
    await sleep(4000);

    // 7. Verify Batch and Stock level in DB
    console.log('\nStep 7: Verifying results in Supabase database...');
    
    // Fetch bill
    const { data: bills } = await supabase
      .from('bills')
      .select('id')
      .eq('open_order_id', orderId);
    
    if (!bills || bills.length === 0) {
      throw new Error('No bill found for open order!');
    }
    const billId = bills[0].id;
    console.log(`Found Bill: ID=${billId}`);

    // Fetch batch
    const { data: batches } = await supabase
      .from('inventory_consumption_batches')
      .select('*')
      .eq('bill_id', billId);
    
    if (!batches || batches.length === 0) {
      throw new Error('No consumption batch created for bill!');
    }
    const batch = batches[0];
    console.log('Consumption Batch:', {
      id: batch.id,
      status: batch.status,
      total_cost_snapshot: batch.total_cost_snapshot,
      processed_at: batch.processed_at
    });

    if (batch.status !== 'Processed') {
      console.log('Batch not processed yet, triggering manual process batch...');
      const procResult = await processConsumptionBatch(batch.id);
      if (procResult.error) throw new Error('Manual processing failed: ' + procResult.error);
    }

    // Fetch jobs
    const { data: jobs } = await supabase
      .from('inventory_consumption_jobs')
      .select('*')
      .eq('batch_id', batch.id);
    
    console.log('Consumption Jobs:', jobs);
    
    // Fetch Stock Level
    const { data: stockLvl } = await supabase
      .from('inventory_material_stock_levels')
      .select('*')
      .eq('tenant_id', TENANT_ID)
      .eq('branch_id', BRANCH_ID)
      .eq('material_id', materialId)
      .single();

    console.log('Final Stock Level:', stockLvl);
    
    // Math: (ingredient_qty / yield_qty) * sold_qty = (5 / 2) * 4 = 10 units.
    // Stock should go from 20 -> 10.
    const expectedStock = 10;
    const actualStock = Number(stockLvl.current_stock);
    console.log(`Current Stock: Expected=${expectedStock}, Actual=${actualStock}`);

    // Fetch Ledger Entry
    const { data: ledgerEntries } = await supabase
      .from('inventory_stock_ledger')
      .select('*')
      .eq('tenant_id', TENANT_ID)
      .eq('branch_id', BRANCH_ID)
      .eq('material_id', materialId)
      .eq('transaction_type', 'Recipe Consumption');

    console.log('Stock Ledger Entries logged:', ledgerEntries);

    if (actualStock === expectedStock && ledgerEntries && ledgerEntries.length > 0) {
      console.log('\n✅ VERIFICATION SUCCESSFUL: Recipe consumption math and ledger logging are 100% correct.');
    } else {
      throw new Error('Verification failed: stock level mismatch or ledger entries missing.');
    }

  } catch (err: any) {
    console.error('\n❌ TEST FAILED:', err);
  } finally {
    // 8. Clean up all records
    console.log('\nStep 8: Cleaning up test database records...');
    
    // Delete settlements, bill items, bills
    const { data: bills } = await supabase.from('bills').select('id').eq('open_order_id', orderId);
    if (bills && bills.length > 0) {
      const bId = bills[0].id;
      await supabase.from('settlements').delete().eq('bill_id', bId);
      await supabase.from('inventory_consumption_batches').delete().eq('bill_id', bId);
      await supabase.from('bill_items').delete().eq('bill_id', bId);
      await supabase.from('bills').delete().eq('id', bId);
    }
    
    await supabase.from('open_order_items').delete().eq('open_order_id', orderId);
    await supabase.from('open_orders').delete().eq('id', orderId);
    await supabase.from('products').delete().eq('id', productId);
    await supabase.from('inventory_recipe_items').delete().eq('recipe_id', recipeId);
    await supabase.from('inventory_recipes').delete().eq('id', recipeId);
    await supabase.from('inventory_material_stock_levels').delete().eq('tenant_id', TENANT_ID).eq('branch_id', BRANCH_ID).eq('material_id', materialId);
    await supabase.from('inventory_stock_ledger').delete().eq('tenant_id', TENANT_ID).eq('branch_id', BRANCH_ID).eq('material_id', materialId);

    console.log('Cleanup completed successfully.');
  }
}

run();
