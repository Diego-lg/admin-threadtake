# R2 User Storage Implementation

## Overview

This implementation provides a comprehensive user-centric storage system for Cloudflare R2, following the architectural design for organizing user files in a structured folder hierarchy.

## Architecture

### Folder Structure

```
users/
├── {userId}/
│   ├── mockups/
│   │   ├── {designId}/
│   │   │   ├── default/
│   │   │   ├── back/
│   │   │   ├── sleeve_left/
│   │   │   └── sleeve_right/
│   │   └── temp/
│   ├── profile-pictures/
│   │   ├── current.{ext}
│   │   └── history/
│   ├── assets/
│   │   ├── logos/
│   │   ├── patterns/
│   │   └── uploads/
│   └── exports/
│       ├── designs/
│       └── collections/
```

### Path Generation Patterns

- **Mockups**: `users/{userId}/mockups/{designId}/{mockupType}/{timestamp}_{uuid}.{ext}`
- **Profile Pictures**: `users/{userId}/profile-pictures/{type}_{timestamp}_{uuid}.{ext}`
- **Assets**: `users/{userId}/assets/{assetType}/{designId}_{uuid}.{ext}`
- **Exports**: `users/{userId}/exports/{exportType}/{timestamp}_{uuid}.{ext}`

## Implementation Components

### 1. R2 Configuration (`lib/r2-config.ts`)

Centralized R2 configuration management with:

- Environment variable validation
- S3 client initialization
- Configuration status checking
- Error handling for missing credentials

**Key Features:**

- Singleton pattern for configuration
- Automatic client initialization
- Validation utilities
- Debug logging capabilities

### 2. R2 User Storage (`lib/r2-user-storage.ts`)

Core storage utilities for user folder management:

**Classes:**

- `UserFolderPaths`: Path generation utilities
- `UserFileNaming`: File naming strategies
- `R2UserStorage`: Main storage operations

**Key Features:**

- UUID-based file naming for uniqueness
- Automatic folder creation
- File existence checking
- User folder structure management
- Path validation and generation

### 3. User Folder Service (`services/user-folder-service.ts`)

High-level service for user folder operations:

**Key Features:**

- User folder initialization
- Metadata management
- Access validation
- Statistics tracking
- Automatic folder creation on first access
- Integration with database for user validation

### 4. File Helpers (`lib/r2-file-helpers.ts`)

Utility functions for file operations:

**Key Features:**

- File validation (size, type, extension)
- Content type detection
- Path format conversion (old to new)
- Presigned URL generation
- File upload/download utilities
- Copy and move operations

## Usage Examples

### Initialize User Folder

```typescript
import { UserFolderService } from "@/services/user-folder-service";

// Initialize folder structure for a new user
await UserFolderService.initializeUserFolder("user-123");
```

### Generate Mockup Path

```typescript
import { UserFolderService } from "@/services/user-folder-service";

// Get path for a new mockup
const { key, publicUrl } = await UserFolderService.getMockupPath(
  "user-123",
  "design-456",
  "default",
  "jpg"
);
```

### Upload File

```typescript
import { R2FileHelpers } from "@/lib/r2-file-helpers";

// Upload a profile picture
const result = await R2FileHelpers.uploadFile(
  "user-123",
  file,
  "profilePicture"
);
```

### Validate User Access

```typescript
import { UserFolderService } from "@/services/user-folder-service";

// Check if user can access a file
const hasAccess = await UserFolderService.validateUserFileAccess(
  "user-123",
  "users/user-123/mockups/design-456/default/image.jpg"
);
```

## Error Handling

All components include comprehensive error handling:

- **Configuration Errors**: Missing environment variables
- **Validation Errors**: Invalid user IDs, file types, or paths
- **Permission Errors**: User access violations
- **Network Errors**: R2 connection issues
- **File System Errors**: Folder creation, file operations

## Security Features

- **User Isolation**: Each user has their own folder structure
- **Access Validation**: All file operations validate user permissions
- **Path Sanitization**: Prevents directory traversal attacks
- **File Validation**: Validates file types and sizes
- **Presigned URLs**: Temporary access URLs for uploads/downloads

## Migration Support

The implementation includes utilities for migrating from old path formats:

```typescript
import { R2FileHelpers } from "@/lib/r2-file-helpers";

// Convert old path to new user-centric format
const newPath = R2FileHelpers.convertOldPathToNewFormat(
  "mockups/design-456/default/image.jpg",
  "user-123"
);
// Result: 'users/user-123/mockups/design-456/default/image.jpg'
```

## Performance Considerations

- **Lazy Initialization**: Folders created only when needed
- **Parallel Operations**: Multiple folders created simultaneously
- **Caching**: Configuration cached for reuse
- **Batch Operations**: Support for bulk file operations
- **Presigned URLs**: Direct uploads to R2 without server proxy

## Testing

The implementation includes a test script (`test-r2-user-storage.js`) for verification:

```bash
cd backend_threadtake
node test-r2-user-storage.js
```

## Integration Points

### API Endpoints

These utilities are designed to be integrated with existing API endpoints:

- **Profile Picture Upload**: `/api/account/profile-picture`
- **Design Mockups**: `/api/designs/save-with-mockups`
- **File Management**: `/api/r2-images`
- **Export Generation**: Future export endpoints

### Database Integration

The UserFolderService integrates with the existing Prisma database for:

- User validation
- Metadata storage
- Usage statistics
- Access control

## Configuration Requirements

The following environment variables must be configured:

```env
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_BUCKET_URL=https://your-public-url.r2.dev
```

## Future Enhancements

Potential improvements for future iterations:

1. **CDN Integration**: Automatic CDN URL generation
2. **File Compression**: Automatic image optimization
3. **Backup Strategy**: Automated backup policies
4. **Analytics**: Storage usage analytics
5. **Lifecycle Management**: Automatic file cleanup
6. **Multi-region Support**: Geographic distribution

## Conclusion

This implementation provides a robust, secure, and scalable foundation for user-centric file storage in Cloudflare R2. It follows best practices for security, performance, and maintainability while providing a clean API for integration with existing systems.

The modular design allows for easy extension and modification, while the comprehensive error handling ensures reliable operation in production environments.
