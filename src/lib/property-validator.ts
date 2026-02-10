import { getFiles, setCustomProperties } from './yandex-disk';

export async function checkPropertyUsage(
  propertyType: string,
  value: string
): Promise<{ isUsed: boolean; fileCount: number; fileNames: string[] }> {
  try {
    const files = await getFiles();
    const matchingFiles: string[] = [];

    for (const file of files) {
      if (file.custom_properties) {
        const properties = file.custom_properties;

        // Check if the property value exists in any of the custom properties
        for (const [key, propValue] of Object.entries(properties)) {
          if (key === propertyType && propValue === value) {
            matchingFiles.push(file.name);
            break;
          }
        }
      }
    }

    return {
      isUsed: matchingFiles.length > 0,
      fileCount: matchingFiles.length,
      fileNames: matchingFiles,
    };
  } catch (error) {
    console.error('Error checking property usage:', error);
    return {
      isUsed: false,
      fileCount: 0,
      fileNames: [],
    };
  }
}

export async function updatePropertyInFiles(
  propertyType: string,
  oldValue: string,
  newValue: string
): Promise<{ success: boolean; updatedCount: number; errors: string[] }> {
  try {
    const files = await getFiles();
    let updatedCount = 0;
    const errors: string[] = [];

    for (const file of files) {
      if (file.custom_properties) {
        const properties = file.custom_properties;
        let needsUpdate = false;

        // Check if this file has the old property value
        for (const [key, propValue] of Object.entries(properties)) {
          if (key === propertyType && propValue === oldValue) {
            needsUpdate = true;
            break;
          }
        }

        if (needsUpdate) {
          // Update the property value
          const updatedProperties = {
            ...properties,
            [propertyType]: newValue,
          };

          // Save the updated properties back to Yandex Disk
          const success = await setCustomProperties(file.path, updatedProperties);

          if (success) {
            updatedCount++;
          } else {
            errors.push(file.name);
          }
        }
      }
    }

    return {
      success: errors.length === 0,
      updatedCount,
      errors,
    };
  } catch (error) {
    console.error('Error updating property in files:', error);
    return {
      success: false,
      updatedCount: 0,
      errors: ['System error occurred'],
    };
  }
}
