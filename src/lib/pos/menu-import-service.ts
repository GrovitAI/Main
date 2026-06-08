import { supabase } from './supabase';
import { getTenantContext } from './tenant-context';
import { fetchActiveProducts, MenuProduct } from './menu-service';
import { getCategories } from './products-service';
import { fetchRecipes, recordAuditLog } from './inventory-service';
import type { ServiceResult } from './settlement-service';

export interface ProductImportRow {
  'Product Name*'?: string;
  'Product Name'?: string;
  'Price*'?: string | number;
  'Price'?: string | number;
  'Category Name*'?: string;
  'Category Name'?: string;
  'Inventory Tracking Enabled'?: string | boolean;
  'Linked Recipe Code'?: string;
}

export interface ValidatedProductRow {
  index: number;
  originalRow: ProductImportRow;
  productName: string;
  price: number;
  categoryName: string;
  inventoryTrackingEnabled: boolean;
  linkedRecipeCode: string;
  
  action: 'create' | 'update' | 'error';
  status: 'valid' | 'invalid';
  errors: string[];
  warnings: string[];
  
  categoryId?: string;
  recipeId?: string;
  productId?: string;
}

export interface ProductValidationSummary {
  totalRows: number;
  validRows: number;
  errorRows: number;
  createCount: number;
  updateCount: number;
  rows: ValidatedProductRow[];
}

/**
 * Perform dry-run validation on the spreadsheet rows for menu products.
 * Categorizes each row into creates, updates, and errors.
 * Matches existing items by name.
 * Shows warnings for missing recipes.
 */
export async function validateProductImportRows(rows: ProductImportRow[]): Promise<ProductValidationSummary> {
  // Fetch existing database entities
  const [catsRes, prodsRes, recipesRes] = await Promise.all([
    getCategories(),
    fetchActiveProducts(),
    fetchRecipes()
  ]);

  const existingCategories = catsRes.data || [];
  const existingProducts = prodsRes.data || [];
  const existingRecipes = recipesRes.data || [];

  const validatedRows: ValidatedProductRow[] = [];
  let createCount = 0;
  let updateCount = 0;
  let errorRows = 0;

  rows.forEach((row, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const rawName = row['Product Name*'] !== undefined ? row['Product Name*'] : row['Product Name'];
    const productName = rawName ? String(rawName).trim() : '';

    const rawPrice = row['Price*'] !== undefined ? row['Price*'] : row['Price'];
    const price = Number(rawPrice);

    const rawCategory = row['Category Name*'] !== undefined ? row['Category Name*'] : row['Category Name'];
    const categoryName = rawCategory ? String(rawCategory).trim() : '';

    const rawTracking = row['Inventory Tracking Enabled'];
    const trackingStr = rawTracking !== undefined ? String(rawTracking).toLowerCase().trim() : '';
    const inventoryTrackingEnabled = trackingStr === 'yes' || trackingStr === 'true' || rawTracking === true;

    const rawRecipe = row['Linked Recipe Code'];
    const linkedRecipeCode = rawRecipe !== undefined ? String(rawRecipe).trim() : '';

    if (!productName) {
      errors.push("Product Name is required.");
    }
    if (rawPrice === undefined || rawPrice === null || isNaN(price) || price < 0) {
      errors.push("Price must be a valid positive number.");
    }
    if (!categoryName) {
      errors.push("Category Name is required.");
    }

    let action: 'create' | 'update' | 'error' = 'create';
    let matchedProduct: MenuProduct | undefined;

    if (productName) {
      matchedProduct = existingProducts.find(
        p => p.name.toLowerCase() === productName.toLowerCase()
      );
    }

    if (errors.length > 0) {
      action = 'error';
    } else if (matchedProduct) {
      action = 'update';
    } else {
      action = 'create';
    }

    // Match Category
    let categoryId: string | undefined;
    if (categoryName) {
      const matchedCat = existingCategories.find(
        c => c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (matchedCat) {
        categoryId = matchedCat.id;
      } else {
        warnings.push(`Category '${categoryName}' not found. It will be auto-created.`);
      }
    }

    // Match Recipe
    let recipeId: string | undefined;
    if (linkedRecipeCode) {
      const matchedRecipe = existingRecipes.find(
        r => r.recipe_code.toLowerCase() === linkedRecipeCode.toLowerCase()
      );
      if (matchedRecipe) {
        recipeId = matchedRecipe.id;
      } else {
        warnings.push(`Linked Recipe Code '${linkedRecipeCode}' not found. No recipe will be linked.`);
      }
    }

    const status = errors.length > 0 ? 'invalid' : 'valid';

    if (status === 'invalid') {
      errorRows++;
    } else if (action === 'create') {
      createCount++;
    } else if (action === 'update') {
      updateCount++;
    }

    validatedRows.push({
      index,
      originalRow: row,
      productName,
      price: isNaN(price) ? 0 : price,
      categoryName,
      inventoryTrackingEnabled,
      linkedRecipeCode,
      action,
      status,
      errors,
      warnings,
      categoryId,
      recipeId,
      productId: matchedProduct?.id
    });
  });

  return {
    totalRows: rows.length,
    validRows: rows.length - errorRows,
    errorRows,
    createCount,
    updateCount,
    rows: validatedRows
  };
}

/**
 * Processes and executes the import of validated product rows.
 * Auto-creates Categories but NOT Recipes (shows validation warnings instead).
 * Logs each import action into inventory_audit_logs.
 */
export async function importMenuProducts(
  validatedRows: ValidatedProductRow[]
): Promise<ServiceResult<{ success: boolean; count: number }>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    // Fetch refreshed lists of categories
    const catsRes = await getCategories();
    const categoriesMap = new Map<string, string>();
    (catsRes.data || []).forEach(c => categoriesMap.set(c.name.toLowerCase(), c.id));

    let importCount = 0;

    for (const row of validatedRows) {
      if (row.status === 'invalid') continue;

      // 1. Resolve or Auto-create Category
      let finalCategoryId: string | null = null;
      if (row.categoryName) {
        const key = row.categoryName.toLowerCase();
        if (categoriesMap.has(key)) {
          finalCategoryId = categoriesMap.get(key) || null;
        } else {
          // Create new category
          const { data: newCat, error: catErr } = await supabase
            .from('categories')
            .insert({
              tenant_id,
              branch_id,
              name: row.categoryName
            })
            .select('*')
            .single();

          if (newCat && !catErr) {
            finalCategoryId = newCat.id;
            categoriesMap.set(key, newCat.id);
          } else {
            console.error('Failed to create category:', catErr);
            continue;
          }
        }
      }

      // 2. Insert or Update Product
      const payload: Record<string, any> = {
        tenant_id,
        branch_id,
        name: row.productName,
        price: row.price,
        category_id: finalCategoryId,
        is_available: true,
        is_active: true,
        inventory_tracking_enabled: row.inventoryTrackingEnabled,
        recipe_id: row.recipeId || null
      };

      let saveRes;
      if (row.action === 'update' && row.productId) {
        saveRes = await supabase
          .from('products')
          .update(payload)
          .eq('id', row.productId)
          .eq('tenant_id', tenant_id)
          .eq('branch_id', branch_id)
          .select('*')
          .single();
      } else {
        saveRes = await supabase
          .from('products')
          .insert(payload)
          .select('*')
          .single();
      }

      if (saveRes.error || !saveRes.data) {
        console.error(`Failed to save product ${row.productName}:`, saveRes.error);
        continue;
      }

      const savedProduct = saveRes.data;

      // 3. Write to inventory_audit_logs
      await recordAuditLog(
        'products' as any,
        savedProduct.id,
        row.action === 'update' ? 'UPDATE' : 'CREATE',
        row.action === 'update' ? { id: row.productId, name: row.productName } : null,
        savedProduct
      );

      importCount++;
    }

    return { data: { success: true, count: importCount }, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Import execution failed.' };
  }
}
