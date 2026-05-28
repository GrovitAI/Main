import { supabase } from './supabase';
import { TENANT_ID, BRANCH_ID } from './tenant-context';

export async function seedDevDatabase(): Promise<void> {
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return;
  }

  try {
    // 1. Dynamic OpenAPI schema introspection to detect real database columns
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

    let categoriesCols = new Set<string>();
    let productsCols = new Set<string>();
    let openOrdersCols = new Set<string>();
    let openOrderItemsCols = new Set<string>();
    let detectedSchemaSuccessfully = false;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const restUrl = `${supabaseUrl}/rest/v1/`;
        const res = await fetch(restUrl, {
          headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
        });
        if (res.ok) {
          const schema = await res.json();
          const definitions = schema.definitions;
          if (definitions) {
            const extractCols = (tableName: string) => {
              const properties = definitions[tableName]?.properties;
              if (properties) {
                return new Set(Object.keys(properties));
              }
              return new Set<string>();
            };

            categoriesCols = extractCols('categories');
            productsCols = extractCols('products');
            openOrdersCols = extractCols('open_orders');
            openOrderItemsCols = extractCols('open_order_items');
            detectedSchemaSuccessfully = true;
          }
        }
      } catch {
        // Fail silently and fall back to verified minimal schema
      }
    }

    const categoriesFallback = ['tenant_id', 'branch_id', 'name'];
    const productsFallback = ['tenant_id', 'branch_id', 'category_id', 'name', 'price', 'is_available'];
    const openOrdersFallback = ['tenant_id', 'branch_id', 'order_name', 'status'];
    const openOrderItemsFallback = ['open_order_id', 'product_id', 'item_name', 'price', 'qty', 'kot_sent'];

    const filterPayload = (
      payload: Record<string, any>,
      allowedCols: Set<string>,
      fallbackCols: string[]
    ) => {
      const filtered: Record<string, any> = {};
      const colsToUse = detectedSchemaSuccessfully ? allowedCols : new Set(fallbackCols);
      for (const [key, val] of Object.entries(payload)) {
        if (colsToUse.has(key)) {
          filtered[key] = val;
        }
      }
      return filtered;
    };

    // 2. Check categories existence
    const { data: existingCategories, error: categoryCheckError } = await supabase
      .from('categories')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .eq('branch_id', BRANCH_ID)
      .limit(1);

    if (categoryCheckError) {
      return;
    }

    let insertedProducts: { id: string; name: string; price: number }[] | null = null;

    if (!existingCategories || existingCategories.length === 0) {
      const categoriesToSeed = [
        { name: 'Signature Desserts' },
        { name: 'Kunafa Specials' },
        { name: 'Dessert Cups' },
        { name: 'Milkshakes & Drinks' },
        { name: 'Hot Beverages' },
        { name: 'Add-ons' },
      ];

      const categoriesPayload = categoriesToSeed.map((cat) =>
        filterPayload(
          {
            ...cat,
            tenant_id: TENANT_ID,
            branch_id: BRANCH_ID,
          },
          categoriesCols,
          categoriesFallback
        )
      );

      const { data: insertedCategories, error: categoryInsertError } = await supabase
        .from('categories')
        .insert(categoriesPayload)
        .select();

      if (categoryInsertError || !insertedCategories) {
        return;
      }

      const categoryIdMap: Record<string, string> = {};
      for (const cat of insertedCategories) {
        categoryIdMap[cat.name] = cat.id;
      }

      const productsToSeed = [
        // Signature Desserts
        { name: 'Salankatiya Lotus', price: 320, categoryName: 'Signature Desserts' },
        { name: 'Salankatiya Pistachio', price: 340, categoryName: 'Signature Desserts' },
        { name: 'Salankatiya Belgian Chocolate', price: 310, categoryName: 'Signature Desserts' },
        { name: 'UFO Chocolate Burger', price: 290, categoryName: 'Signature Desserts' },
        { name: 'Lazy Cat Dessert', price: 260, categoryName: 'Signature Desserts' },

        // Kunafa Specials
        { name: 'Kunafa Cheese', price: 280, categoryName: 'Kunafa Specials' },
        { name: 'Kunafa Cream', price: 250, categoryName: 'Kunafa Specials' },
        { name: 'Pistachio Kunafa', price: 320, categoryName: 'Kunafa Specials' },
        { name: 'Lotus Kunafa', price: 290, categoryName: 'Kunafa Specials' },

        // Dessert Cups
        { name: 'Lotus Dessert Cup', price: 220, categoryName: 'Dessert Cups' },
        { name: 'Pistachio Dessert Cup', price: 240, categoryName: 'Dessert Cups' },
        { name: 'Chocolate Overload Cup', price: 200, categoryName: 'Dessert Cups' },
        { name: 'Red Velvet Dessert Cup', price: 180, categoryName: 'Dessert Cups' },

        // Milkshakes & Drinks
        { name: 'Lotus Milkshake', price: 210, categoryName: 'Milkshakes & Drinks' },
        { name: 'Oreo Milkshake', price: 180, categoryName: 'Milkshakes & Drinks' },
        { name: 'Belgian Chocolate Shake', price: 220, categoryName: 'Milkshakes & Drinks' },
        { name: 'Mint Lime Mojito', price: 160, categoryName: 'Milkshakes & Drinks' },

        // Hot Beverages
        { name: 'Arabic Coffee', price: 140, categoryName: 'Hot Beverages' },
        { name: 'Hot Chocolate', price: 170, categoryName: 'Hot Beverages' },
        { name: 'Cappuccino', price: 150, categoryName: 'Hot Beverages' },

        // Add-ons
        { name: 'Extra Pistachio', price: 80, categoryName: 'Add-ons' },
        { name: 'Extra Chocolate Sauce', price: 50, categoryName: 'Add-ons' },
        { name: 'Extra Ice Cream Scoop', price: 60, categoryName: 'Add-ons' },
      ];

      const productsPayload = productsToSeed.map((prod) =>
        filterPayload(
          {
            tenant_id: TENANT_ID,
            branch_id: BRANCH_ID,
            name: prod.name,
            price: prod.price,
            category_id: categoryIdMap[prod.categoryName] ?? null,
            is_available: true,
          },
          productsCols,
          productsFallback
        )
      );

      const { data: seededProducts, error: productInsertError } = await supabase
        .from('products')
        .insert(productsPayload)
        .select('id, name, price');

      if (productInsertError || !seededProducts) {
        return;
      }

      insertedProducts = seededProducts;
    }

    // 3. Check if open_orders is empty to create starter order
    const { data: existingOrders, error: orderCheckError } = await supabase
      .from('open_orders')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .eq('branch_id', BRANCH_ID)
      .eq('status', 'open')
      .limit(1);

    if (orderCheckError) {
      return;
    }

    if (!existingOrders || existingOrders.length === 0) {
      const orderPayload = filterPayload(
        {
          tenant_id: TENANT_ID,
          branch_id: BRANCH_ID,
          order_name: 'DEV-001',
          status: 'open',
        },
        openOrdersCols,
        openOrdersFallback
      );

      const { data: newOrder, error: orderInsertError } = await supabase
        .from('open_orders')
        .insert(orderPayload)
        .select()
        .single();

      if (orderInsertError || !newOrder) {
        return;
      }

      let products = insertedProducts;
      if (!products) {
        const { data: fetchedProducts } = await supabase
          .from('products')
          .select('id, name, price')
          .eq('tenant_id', TENANT_ID)
          .eq('branch_id', BRANCH_ID);
        products = fetchedProducts;
      }

      if (products && products.length > 0) {
        const salankatiyaLotus = products.find((p) => p.name === 'Salankatiya Lotus');
        const lotusMilkshake = products.find((p) => p.name === 'Lotus Milkshake');

        const orderItemsPayload = [];
        if (salankatiyaLotus) {
          orderItemsPayload.push(
            filterPayload(
              {
                open_order_id: newOrder.id,
                product_id: salankatiyaLotus.id,
                item_name: salankatiyaLotus.name,
                qty: 1,
                price: salankatiyaLotus.price,
                kot_sent: false,
              },
              openOrderItemsCols,
              openOrderItemsFallback
            )
          );
        }
        if (lotusMilkshake) {
          orderItemsPayload.push(
            filterPayload(
              {
                open_order_id: newOrder.id,
                product_id: lotusMilkshake.id,
                item_name: lotusMilkshake.name,
                qty: 1,
                price: lotusMilkshake.price,
                kot_sent: false,
              },
              openOrderItemsCols,
              openOrderItemsFallback
            )
          );
        }

        if (orderItemsPayload.length > 0) {
          await supabase.from('open_order_items').insert(orderItemsPayload);
        }
      }
    }

    // 4. Seed transaction history (bills, bill_items, settlements) for the past 7 days
    const { data: existingBills, error: billsCheckError } = await supabase
      .from('bills')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .eq('branch_id', BRANCH_ID)
      .limit(1);

    if (!billsCheckError && (!existingBills || existingBills.length === 0)) {
      console.log('[Grovit] Seeding mock analytics bills...');
      const { data: products } = await supabase
        .from('products')
        .select('id, name, price')
        .eq('tenant_id', TENANT_ID)
        .eq('branch_id', BRANCH_ID);

      if (products && products.length > 0) {
        const billsData = [];
        const paymentTypes = ['upi', 'cash', 'card'];
        
        // Generate mock bills for the past 7 days (including today)
        for (let d = 0; d <= 7; d++) {
          const numBills = Math.floor(Math.random() * 4) + 4; // 4 to 7 bills per day
          for (let b = 0; b < numBills; b++) {
            // Determine date & time
            // Distribute hours: mostly lunch (12-14) and dinner (19-22), some other times
            let hour = 12 + Math.floor(Math.random() * 3); // lunch
            if (Math.random() > 0.4) {
              hour = 18 + Math.floor(Math.random() * 5); // dinner
            } else if (Math.random() > 0.7) {
              hour = 9 + Math.floor(Math.random() * 3); // breakfast/morning
            }
            
            const minute = Math.floor(Math.random() * 60);
            const date = new Date();
            date.setDate(date.getDate() - d);
            date.setHours(hour, minute, 0, 0);
            
            const timestamp = date.toISOString();
            
            // Random status (mostly paid, a few cancelled)
            const isCancelled = d > 0 && Math.random() < 0.08; // 8% chance of cancellation
            const status = isCancelled ? 'cancelled' : 'paid';

            // Pick 1 to 4 random items
            const numItems = Math.floor(Math.random() * 3) + 1;
            const items = [];
            let subtotal = 0;
            
            for (let i = 0; i < numItems; i++) {
              const prod = products[Math.floor(Math.random() * products.length)];
              const qty = Math.floor(Math.random() * 2) + 1;
              const itemPrice = prod.price;
              subtotal += itemPrice * qty;
              items.push({
                product_id: prod.id,
                item_name: prod.name,
                price: itemPrice,
                qty
              });
            }
            
            const tax_amount = Math.round(subtotal * 0.05 * 100) / 100; // 5% tax
            const total_amount = subtotal + tax_amount;
            
            billsData.push({
              tenant_id: TENANT_ID,
              branch_id: BRANCH_ID,
              total_amount,
              subtotal,
              tax_amount,
              discount_amount: 0,
              status,
              created_at: timestamp,
              settled_at: status === 'paid' ? timestamp : null,
              created_by: 'Owner',
              _items: items,
              _payment_type: paymentTypes[Math.floor(Math.random() * paymentTypes.length)]
            });
          }
        }
        
        // Insert bills and their dependent items & settlements
        for (const billRaw of billsData) {
          const { _items, _payment_type, ...billPayload } = billRaw;
          const { data: newBill, error: billErr } = await supabase
            .from('bills')
            .insert(billPayload)
            .select()
            .single();
            
          if (!billErr && newBill) {
            // Insert bill items
            const itemsPayload = _items.map((item: any) => ({
              bill_id: newBill.id,
              product_id: item.product_id,
              item_name: item.item_name,
              price: item.price,
              qty: item.qty
            }));
            await supabase.from('bill_items').insert(itemsPayload);
            
            // Insert settlement if paid
            if (newBill.status === 'paid') {
              await supabase.from('settlements').insert({
                tenant_id: TENANT_ID,
                branch_id: BRANCH_ID,
                bill_id: newBill.id,
                amount: newBill.total_amount,
                payment_type: _payment_type,
                created_at: newBill.created_at
              });
            }
          }
        }
        console.log('[Grovit] Mock bills, items, and settlements seeded successfully.');
      }
    }

    console.log('[Grovit] Le Leban DEV seed complete');
  } catch {
    // Fail silently in dev seed catch to avoid breaking startup
  }
}

