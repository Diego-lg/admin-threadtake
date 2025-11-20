# R2 User-Centric Storage Implementation Summary

## Overview

This document summarizes the implementation of a user-centric storage system for Cloudflare R2, replacing the previous flat-file structure with organized user folders. This implementation provides better security, organization, and scalability for user files.

## Implementation Details

### 1. Core Storage Libraries

#### R2 User Storage Library (`lib/r2-user-storage.ts`)

- **UserFolderPaths**: Class for generating consistent user folder paths
- **UserFileNaming**: Class for generating unique filenames with timestamps and UUIDs
- **R2UserStorage**: Core class for R2 operations with user-centric paths
- **Types**: Defined types for MockupType, AssetType, ExportType, ProfilePictureType

#### User Folder Service (`services/user-folder-service.ts`)

- High-level service for managing user folders
- Methods for folder initialization, metadata tracking, and access validation
- Integration with database models for storing file metadata

#### R2 Configuration (`lib/r2-config.ts`)

- Centralized R2 configuration management
- Environment variable validation
- S3 client initialization with proper R2 settings

### 2. Updated API Endpoints

#### Existing Endpoints Updated

1. **`/api/r2/generate-upload-url`**

   - Updated to support user-specific paths
   - Added support for different content types (mockups, profile-pictures, assets, exports)
   - Enhanced validation and error handling

2. **`/api/r2-images`**

   - Updated to use user-specific file listing
   - Added pagination and filtering capabilities
   - Enhanced access control

3. **`/api/account/profile-picture`**

   - Updated to use new profile picture folder structure
   - Added support for profile picture history
   - Enhanced with GET and DELETE methods

4. **`/api/designs/save-with-mockups-async`**

   - Updated to generate design IDs for folder organization
   - Integration with new mockup storage system
   - Enhanced job tracking

5. **`lib/mockup-worker.ts`**
   - Updated to store mockups in user-specific folders
   - Support for different mockup types (default, back, sleeve_left, sleeve_right)
   - Enhanced error handling and logging

#### New User-Specific Endpoints

1. **`/api/r2/user/files`**

   - Comprehensive file management endpoint
   - Support for listing, searching, sorting, and deleting files
   - Admin access to other users' files

2. **`/api/r2/user/mockups`**

   - Specialized endpoint for mockup management
   - Design-based organization
   - Statistics and metadata tracking

3. **`/api/r2/user/assets`**

   - Asset management with type-based organization
   - Support for logos, patterns, and uploads
   - Design-specific asset organization

4. **`/api/r2/user/exports`**

   - Export management with type-based organization
   - Support for designs and collections exports
   - Download tracking and statistics

5. **`/api/r2/translate-url`**
   - Backward compatibility endpoint
   - Translates legacy URLs to new user-centric format
   - Batch translation support

### 3. Database Updates

#### Schema Changes (`prisma/schema.prisma`)

1. **User Model Updates**

   - Added `profilePictureKey` and `profilePicturePath` fields
   - Indexes for faster lookups

2. **SavedDesign Model Updates**

   - Added `designId`, `designFolderKey`, and `mockupFolderKey` fields
   - Indexes for design-based organization

3. **MockupJob Model Updates**

   - Enhanced with design ID support
   - Indexes for improved performance

4. **New UserFileMetadata Model**
   - Comprehensive file metadata tracking
   - Support for file statistics and access patterns

#### Migration Script (`migrations/update_user_storage_paths.sql`)

- SQL script for updating database schema
- Functions for extracting user IDs from paths
- Triggers for automatic metadata updates
- Indexes for performance optimization

### 4. Folder Structure

#### New User-Centric Structure

```
users/{userId}/
├── mockups/
│   ├── {designId}/
│   │   ├── default/
│   │   ├── back/
│   │   ├── sleeve_left/
│   │   └── sleeve_right/
│   └── temp/
├── profile-pictures/
│   ├── current/
│   └── history/
├── assets/
│   ├── logos/
│   ├── patterns/
│   └── uploads/
└── exports/
    ├── designs/
    └── collections/
```

#### Legacy Structure (for backward compatibility)

```
designs/
profile_pictures/
user-uploads/
mockups/
```

### 5. Security and Access Control

#### User Isolation

- Each user has their own folder structure
- Access validation for all file operations
- Admin access to other users' files when needed

#### Path Validation

- Validation of user access to file paths
- Prevention of path traversal attacks
- Secure file key generation

#### Authentication

- Integration with NextAuth for user authentication
- Role-based access control (USER, ADMIN)
- Session validation for all operations

### 6. Error Handling and Logging

#### Comprehensive Error Handling

- Try-catch blocks for all operations
- Detailed error messages for debugging
- User-friendly error responses

#### Logging

- Detailed logging for all operations
- User action tracking
- Performance monitoring

### 7. Backward Compatibility

#### URL Translation

- `/api/r2/translate-url` endpoint for translating legacy URLs
- Support for batch translation
- Automatic detection of URL patterns

#### Legacy Support

- Support for existing file structures
- Gradual migration path
- Fallback mechanisms

## Implementation Benefits

### 1. Improved Organization

- User-specific folder structure
- Type-based file organization
- Design-specific mockup organization

### 2. Enhanced Security

- User isolation
- Access validation
- Secure path generation

### 3. Better Performance

- Optimized queries with indexes
- Efficient file listing
- Reduced scanning of irrelevant files

### 4. Scalability

- Support for large numbers of users
- Efficient file organization
- Optimized storage utilization

### 5. Maintainability

- Centralized configuration
- Consistent path generation
- Comprehensive error handling

## Testing Recommendations

### 1. Unit Tests

- Test all utility functions
- Test path generation
- Test file naming

### 2. Integration Tests

- Test API endpoints
- Test file operations
- Test access control

### 3. End-to-End Tests

- Test complete workflows
- Test file upload and retrieval
- Test user folder initialization

### 4. Performance Tests

- Test file listing with large numbers of files
- Test concurrent operations
- Test database query performance

## Migration Steps

### 1. Database Migration

1. Run the migration script to update the database schema
2. Update the Prisma schema and generate the client
3. Test the database changes

### 2. Code Deployment

1. Deploy the updated libraries and services
2. Test the updated API endpoints
3. Monitor for errors and performance issues

### 3. Data Migration

1. Use the URL translation endpoint to update existing URLs
2. Migrate existing files to the new structure
3. Update database records with new paths

### 4. Testing and Validation

1. Test all functionality
2. Validate security measures
3. Monitor performance and usage

## Conclusion

The implementation of a user-centric storage system for Cloudflare R2 provides significant improvements in organization, security, and scalability. The comprehensive set of libraries, services, and API endpoints ensures a robust and maintainable solution for managing user files.

The backward compatibility features ensure a smooth transition from the legacy system, while the new architecture provides a solid foundation for future enhancements.
