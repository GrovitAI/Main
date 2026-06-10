import {
  fetchCategories,
  fetchUnits,
  fetchSuppliers,
  fetchMaterials,
  saveCategory,
  saveUnit,
  saveMaterial,
  recordAuditLog,
  InventoryMaterial,
  ServiceResult,
  getNextMaterialCode
} from './inventory-service';
import { getTenantContext } from './tenant-context';

export interface ImportRow {
  'Material Code'?: string | number;
  'Material Code*'?: string | number;
  'Material Name'?: string;
  'Material Name*'?: string;
  'Category'?: string;
  'Unit'?: string;
  'Reorder Level'?: string | number;
  'Average Cost'?: string | number;
  'Preferred Supplier'?: string;
}

export interface ValidatedImportRow {
  index: number;
  originalRow: ImportRow;
  materialCode: string;
  materialName: string;
  categoryName: string;
  unitName: string;
  reorderLevel: number;
  averageCost: number;
  preferredSupplierName: string;
  
  action: 'create' | 'update' | 'error';
  status: 'valid' | 'invalid';
  errors: string[];
  warnings: string[];
  
  categoryId?: string;
  unitId?: string;
  supplierId?: string;
}

export interface ValidationSummary {
  totalRows: number;
  validRows: number;
  errorRows: number;
  createCount: number;
  updateCount: number;
  rows: ValidatedImportRow[];
}

/**
 * Perform dry-run validation on the spreadsheet rows.
 * Categorizes each row into creates, updates, and errors.
 * Matches existing items by material_code (primary) and material_name (fallback).
 * Shows warnings for missing suppliers.
 */
export async function validateImportRows(rows: ImportRow[]): Promise<ValidationSummary> {
  // Fetch existing database entities
  const [catsRes, unitsRes, supsRes, matsRes] = await Promise.all([
    fetchCategories(),
    fetchUnits(),
    fetchSuppliers(),
    fetchMaterials(undefined, true)
  ]);

  const existingCategories = catsRes.data || [];
  const existingUnits = unitsRes.data || [];
  const existingSuppliers = supsRes.data || [];
  const existingMaterials = matsRes.data || [];

  const validatedRows: ValidatedImportRow[] = [];
  let createCount = 0;
  let updateCount = 0;
  let errorRows = 0;

  rows.forEach((row, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const rawCode = row['Material Code*'] !== undefined ? row['Material Code*'] : row['Material Code'];
    const materialCode = rawCode !== undefined && rawCode !== null ? String(rawCode).trim() : '';
    const rawName = row['Material Name*'] !== undefined ? row['Material Name*'] : row['Material Name'];
    const materialName = rawName !== undefined && rawName !== null ? String(rawName).trim() : '';
    const categoryName = row['Category'] ? String(row['Category']).trim() : '';
    const unitName = row['Unit'] ? String(row['Unit']).trim() : '';
    const reorderLevel = Number(row['Reorder Level']) || 0;
    const averageCost = Number(row['Average Cost']) || 0;
    const preferredSupplierName = row['Preferred Supplier'] ? String(row['Preferred Supplier']).trim() : '';

    if (!materialName) {
      errors.push("Material Name is required.");
    }

    let action: 'create' | 'update' | 'error' = 'create';
    let matchedMaterial: InventoryMaterial | undefined;

    if (materialCode) {
      // Primary match: material_code
      matchedMaterial = existingMaterials.find(
        m => m.material_code.toLowerCase() === materialCode.toLowerCase()
      );
      
      // Fallback match: material_name
      if (!matchedMaterial && materialName) {
        matchedMaterial = existingMaterials.find(
          m => m.material_name.toLowerCase() === materialName.toLowerCase()
        );
      }
    } else if (materialName) {
      // Fallback to name match if code is not provided
      matchedMaterial = existingMaterials.find(
        m => m.material_name.toLowerCase() === materialName.toLowerCase()
      );
    }

    if (errors.length > 0) {
      action = 'error';
    } else if (matchedMaterial) {
      action = 'update';
    } else {
      action = 'create';
    }

    // Match Category
    let categoryId: string | undefined;
    if (categoryName) {
      const matchedCat = existingCategories.find(
        c => c.category_name.toLowerCase() === categoryName.toLowerCase()
      );
      if (matchedCat) {
        categoryId = matchedCat.id;
      } else {
        warnings.push(`Category '${categoryName}' not found. It will be auto-created.`);
      }
    }

    // Match Unit
    let unitId: string | undefined;
    if (unitName) {
      const matchedUnit = existingUnits.find(
        u => u.unit_name.toLowerCase() === unitName.toLowerCase() ||
             u.short_name.toLowerCase() === unitName.toLowerCase() ||
             u.unit_code.toLowerCase() === unitName.toLowerCase()
      );
      if (matchedUnit) {
        unitId = matchedUnit.id;
      } else {
        warnings.push(`Unit '${unitName}' not found. It will be auto-created.`);
      }
    }

    // Match Supplier
    let supplierId: string | undefined;
    if (preferredSupplierName) {
      const matchedSup = existingSuppliers.find(
        s => s.supplier_name.toLowerCase() === preferredSupplierName.toLowerCase()
      );
      if (matchedSup) {
        supplierId = matchedSup.id;
      } else {
        warnings.push(`Preferred Supplier '${preferredSupplierName}' not found. No supplier will be assigned.`);
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
      materialCode,
      materialName,
      categoryName,
      unitName,
      reorderLevel,
      averageCost,
      preferredSupplierName,
      action,
      status,
      errors,
      warnings,
      categoryId,
      unitId,
      supplierId
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
 * Processes and executes the import of validated raw material rows.
 * Auto-creates Categories and Units but NOT Suppliers.
 * Logs each import action into inventory_audit_logs.
 */
export async function importRawMaterials(
  validatedRows: ValidatedImportRow[]
): Promise<ServiceResult<{ success: boolean; count: number }>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    
    // Fetch refreshed lists of categories and units
    const [catsRes, unitsRes, matsRes] = await Promise.all([
      fetchCategories(),
      fetchUnits(),
      fetchMaterials(undefined, true)
    ]);

    if (catsRes.error) return { data: null, error: catsRes.error };
    if (unitsRes.error) return { data: null, error: unitsRes.error };
    if (matsRes.error) return { data: null, error: matsRes.error };

    const categoriesMap = new Map<string, string>();
    (catsRes.data || []).forEach(c => categoriesMap.set(c.category_name.toLowerCase(), c.id));

    const unitsMap = new Map<string, string>();
    (unitsRes.data || []).forEach(u => {
      unitsMap.set(u.unit_name.toLowerCase(), u.id);
      unitsMap.set(u.short_name.toLowerCase(), u.id);
      unitsMap.set(u.unit_code.toLowerCase(), u.id);
    });

    const localMaterials = [...(matsRes.data || [])];
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
          const catRes = await saveCategory({ category_name: row.categoryName });
          if (catRes.data && !catRes.error) {
            finalCategoryId = catRes.data.id;
            categoriesMap.set(key, catRes.data.id);
          }
        }
      }

      // 2. Resolve or Auto-create Unit
      let finalUnitId: string | null = null;
      if (row.unitName) {
        const key = row.unitName.toLowerCase();
        if (unitsMap.has(key)) {
          finalUnitId = unitsMap.get(key) || null;
        } else {
          const cleanUnit = row.unitName.trim();
          const unitRes = await saveUnit({
            unit_name: cleanUnit,
            unit_code: cleanUnit.toUpperCase(),
            short_name: cleanUnit.toLowerCase()
          });
          if (unitRes.data && !unitRes.error) {
            finalUnitId = unitRes.data.id;
            unitsMap.set(key, unitRes.data.id);
          }
        }
      }

      // 3. Find matched material for update or create
      let matchedMaterial = localMaterials.find(
        m => m.material_code.toLowerCase() === row.materialCode.toLowerCase()
      );
      if (!matchedMaterial && row.materialName) {
        matchedMaterial = localMaterials.find(
          m => m.material_name.toLowerCase() === row.materialName.toLowerCase()
        );
      }

      const isUpdate = !!matchedMaterial;
      const oldMaterialObj = matchedMaterial ? { ...matchedMaterial } : null;

      let generatedCode = '';
      if (!matchedMaterial) {
        generatedCode = getNextMaterialCode(localMaterials);
      }

      // 4. Save/Upsert Material
      const materialPayload: Partial<InventoryMaterial> = {
        id: matchedMaterial?.id || undefined,
        material_code: matchedMaterial ? matchedMaterial.material_code : generatedCode,
        material_name: row.materialName,
        category_id: finalCategoryId,
        inventory_unit_id: finalUnitId,
        reorder_level: row.reorderLevel,
        average_cost: row.averageCost,
        preferred_supplier_id: row.supplierId || null,
        is_active: true
      };

      // Set opening stock only on creation
      if (!isUpdate) {
        materialPayload.opening_stock = 0;
        materialPayload.current_stock = 0;
        materialPayload.inventory_value = 0;
      }

      const saveRes = await saveMaterial(materialPayload);
      if (saveRes.error || !saveRes.data) {
        console.error(`Failed to save material ${row.materialCode}:`, saveRes.error);
        continue;
      }

      const savedMaterial = saveRes.data;
      if (!isUpdate) {
        localMaterials.push(savedMaterial);
      }

      // 5. Write to inventory_audit_logs
      await recordAuditLog(
        'materials',
        savedMaterial.id,
        isUpdate ? 'UPDATE' : 'CREATE',
        oldMaterialObj,
        savedMaterial
      );

      importCount++;
    }

    return { data: { success: true, count: importCount }, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Import execution failed.' };
  }
}
