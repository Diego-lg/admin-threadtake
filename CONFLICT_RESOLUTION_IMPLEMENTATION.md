# File Naming Conflict Resolution System

## Overview

This document describes the comprehensive file naming conflict resolution system implemented for the R2 storage system. The system provides automatic and user-controlled conflict resolution options while maintaining performance and data integrity.

## Architecture

### Core Components

1. **R2ConflictResolver** (`lib/r2-conflict-resolver.ts`)

   - Main conflict resolution engine
   - Implements multiple resolution strategies
   - Handles version control and history tracking
   - Provides batch conflict resolution

2. **Enhanced R2FileHelpers** (`lib/r2-file-helpers.ts`)

   - Integrated conflict detection and resolution
   - Batch upload support with conflict handling
   - Version management utilities

3. **API Endpoints**

   - `/api/r2/conflicts` - Conflict detection and resolution
   - `/api/r2/upload-with-resolution` - Single file upload with conflict handling
   - `/api/r2/upload-batch` - Batch upload with conflict resolution

4. **Frontend Components**
   - `ConflictResolutionModal` - Single file conflict resolution UI
   - `BatchConflictResolution` - Batch conflict resolution UI
   - `useFileUploadWithConflictResolution` - React hook for file uploads

## Conflict Resolution Strategies

### Available Strategies

1. **TIMESTAMP** (`timestamp`)

   - Adds timestamp to filename: `file_2025-10-07T11-23-00.ext`
   - Default strategy for most file types
   - Guarantees uniqueness

2. **UUID** (`uuid`)

   - Adds UUID fragment: `file_abc12345.ext`
   - Provides unique identifiers
   - Good for automated systems

3. **SEQUENTIAL** (`sequential`)

   - Adds version numbers: `file_v1.ext`, `file_v2.ext`
   - Maintains version history
   - Default for mockups

4. **CONTENT_HASH** (`content_hash`)

   - Uses content hash: `file_abc123def456.ext`
   - Identifies duplicate files
   - Enables deduplication

5. **OVERWRITE** (`overwrite`)

   - Replaces existing file
   - User confirmation required
   - Maintains original filename

6. **RENAME** (`rename`)

   - Prompts user for custom name
   - Full user control
   - Requires user input

7. **SKIP** (`skip`)
   - Skips conflicting file
   - No changes made
   - Preserves existing files

### Content Type Specific Strategies

- **Profile Pictures**: TIMESTAMP (always create new version)
- **Mockups**: SEQUENTIAL (version control for designs)
- **Assets**: UUID (unique identification)
- **Exports**: TIMESTAMP (avoid conflicts in exports)

## Implementation Details

### Conflict Detection

The system detects various types of conflicts:

1. **Exact Name Match**: Identical filenames
2. **Case Insensitive Match**: Same name, different case
3. **Special Character Variation**: Different special characters
4. **Similar Name**: Pattern-based similarity

### Resolution Process

1. **Detection Phase**

   - Scan existing files in target directory
   - Identify potential conflicts
   - Categorize conflict types

2. **Strategy Selection**

   - Apply default strategy for content type
   - Allow user override
   - Provide preview of results

3. **Resolution Execution**

   - Generate new filename based on strategy
   - Update file metadata
   - Maintain version history

4. **Verification**
   - Confirm resolution success
   - Update file indexes
   - Log resolution actions

### Version Control

The system maintains version history for files:

```typescript
interface FileVersionInfo {
  key: string;
  version: number;
  createdAt: Date;
  size: number;
  contentType: string;
  isActive: boolean;
}
```

Features:

- Automatic version numbering
- Version cleanup policies
- Rollback capabilities
- Metadata preservation

## API Usage

### Detect Conflicts

```typescript
const response = await fetch("/api/r2/conflicts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    filename: "example.jpg",
    fileType: "mockup",
    additionalPath: "design123_default",
  }),
});

const { conflict, hasConflict } = await response.json();
```

### Resolve Conflicts

```typescript
const response = await fetch("/api/r2/conflicts", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    conflict,
    strategy: "timestamp",
    customName: "optional-custom-name.jpg",
  }),
});

const { resolution } = await response.json();
```

### Upload with Conflict Resolution

```typescript
const formData = new FormData();
formData.append("file", file);
formData.append("fileType", "mockup");
formData.append("conflictStrategy", "sequential");

const response = await fetch("/api/r2/upload-with-resolution", {
  method: "POST",
  body: formData,
});

const result = await response.json();
```

## Frontend Integration

### Using the React Hook

```typescript
import { useFileUploadWithConflictResolution } from "@/hooks/use-file-upload-with-conflict-resolution";

function FileUploader() {
  const {
    uploadState,
    showConflictModal,
    currentConflict,
    uploadFile,
    resolveConflict,
    closeConflictModal,
  } = useFileUploadWithConflictResolution({
    defaultStrategy: ConflictResolutionStrategy.TIMESTAMP,
    onComplete: (result) => console.log("Upload complete:", result),
    onError: (error) => console.error("Upload failed:", error),
  });

  const handleFileSelect = (file: File) => {
    uploadFile(file, "mockup", "design123_default");
  };

  return (
    <div>
      <input
        type="file"
        onChange={(e) => handleFileSelect(e.target.files[0])}
      />
      <ConflictResolutionModal
        isOpen={showConflictModal}
        onClose={closeConflictModal}
        conflict={currentConflict}
        onResolve={resolveConflict}
      />
    </div>
  );
}
```

### Batch Upload Example

```typescript
const handleBatchUpload = async (files: File[]) => {
  const result = await uploadBatch(files, "asset", "logos", "uuid");
  console.log("Batch upload result:", result);
};
```

## Performance Optimizations

### Caching

1. **Version Cache**: In-memory caching of file version information
2. **Conflict Detection Cache**: Cached results for recent conflict checks
3. **Strategy Pattern Cache**: Pre-computed resolution patterns

### Batch Operations

1. **Bulk Conflict Detection**: Single API call for multiple files
2. **Batch Resolution**: Efficient resolution of multiple conflicts
3. **Parallel Processing**: Concurrent conflict resolution when possible

### Efficient Algorithms

1. **Hash-based Comparison**: Quick duplicate detection
2. **Pattern Matching**: Efficient filename pattern recognition
3. **Index-based Lookups**: Fast file existence checks

## Configuration

### Default Configuration

```typescript
const DEFAULT_CONFIG: ConflictResolutionConfig = {
  defaultStrategy: ConflictResolutionStrategy.TIMESTAMP,
  enableVersionControl: true,
  maxVersions: 10,
  autoResolveDuplicates: true,
  preserveOriginalNames: true,
  contentTypeStrategies: {
    profilePicture: ConflictResolutionStrategy.TIMESTAMP,
    mockup: ConflictResolutionStrategy.SEQUENTIAL,
    asset: ConflictResolutionStrategy.UUID,
    export: ConflictResolutionStrategy.TIMESTAMP,
  },
};
```

### Custom Configuration

```typescript
const resolver = new R2ConflictResolver({
  defaultStrategy: ConflictResolutionStrategy.UUID,
  maxVersions: 20,
  enableVersionControl: true,
  contentTypeStrategies: {
    customType: ConflictResolutionStrategy.CONTENT_HASH,
  },
});
```

## Testing

### Running Integration Tests

```bash
cd backend_threadtake
node test-conflict-resolution-integration.js
```

### Test Coverage

1. **Unit Tests**: Individual component testing
2. **Integration Tests**: End-to-end workflow testing
3. **Performance Tests**: Load and stress testing
4. **User Experience Tests**: UI/UX workflow validation

## Error Handling

### Common Error Scenarios

1. **Permission Denied**: User lacks access to target directory
2. **Storage Quota Exceeded**: User has exceeded storage limits
3. **Invalid Filename**: Filename contains invalid characters
4. **Network Failure**: Temporary connectivity issues
5. **Concurrent Modifications**: File modified during resolution

### Error Recovery

1. **Retry Mechanisms**: Automatic retry for transient errors
2. **Fallback Strategies**: Alternative resolution methods
3. **User Notification**: Clear error messages and guidance
4. **Rollback Capability**: Undo failed operations

## Security Considerations

1. **Path Traversal Prevention**: Validate all file paths
2. **Access Control**: Enforce user permissions
3. **Input Validation**: Sanitize all user inputs
4. **Rate Limiting**: Prevent abuse of conflict resolution
5. **Audit Logging**: Track all resolution actions

## Monitoring and Analytics

### Metrics to Track

1. **Conflict Frequency**: How often conflicts occur
2. **Resolution Strategy Usage**: Most used strategies
3. **Resolution Success Rate**: Success/failure ratios
4. **Performance Metrics**: Resolution time and resource usage
5. **User Behavior**: Strategy preferences and patterns

### Logging

```typescript
// Example conflict resolution log
{
  timestamp: "2025-10-07T11:23:27.604Z",
  userId: "user123",
  originalFilename: "design.jpg",
  conflictType: "exact_name_match",
  strategy: "timestamp",
  resolvedFilename: "design_2025-10-07T11-23-27.jpg",
  resolutionTime: 45,
  success: true
}
```

## Future Enhancements

1. **Machine Learning**: Predict optimal resolution strategies
2. **Advanced Deduplication**: Content-based file deduplication
3. **Conflict Prevention**: Proactive conflict avoidance
4. **Enhanced UI**: Drag-and-drop conflict resolution
5. **Mobile Support**: Touch-optimized conflict resolution

## Troubleshooting

### Common Issues

1. **Conflicts Not Detected**: Check file permissions and paths
2. **Resolution Fails**: Verify strategy compatibility
3. **Performance Issues**: Review caching configuration
4. **UI Not Responding**: Check for JavaScript errors

### Debug Mode

Enable debug logging:

```typescript
const resolver = new R2ConflictResolver({
  debug: true,
  logLevel: "verbose",
});
```

## Conclusion

The file naming conflict resolution system provides a comprehensive solution for handling file conflicts in the R2 storage system. It offers multiple resolution strategies, maintains performance through optimizations, and provides a user-friendly interface for conflict management.

The system is designed to be extensible, allowing for future enhancements and custom strategies while maintaining backward compatibility with existing file operations.
