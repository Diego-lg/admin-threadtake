# MockupJob Table Setup Guide

## Problem

The async mockup generation is failing with a 500 error because the `MockupJob` table doesn't exist in the database. Prisma commands are hanging, so we need to create the table manually.

## Solution Steps

### 1. Execute SQL in Supabase Dashboard

1. Go to your Supabase dashboard: https://app.supabase.com
2. Select your project
3. Navigate to **SQL Editor** from the left sidebar
4. Click **New query**
5. Copy and paste the entire contents of [`create-mockup-job-table.sql`](./create-mockup-job-table.sql) into the editor
6. Click **Run** to execute the SQL

The SQL will:

- Create the `MockupJob` table with all required fields
- Add performance indexes
- Create foreign key constraint to the `User` table

### 2. Verify Table Creation

After running the SQL, verify the table was created:

1. In Supabase dashboard, go to **Table Editor**
2. You should see `MockupJob` in the list of tables
3. Click on it to verify the structure

### 3. Test the Setup

Run the test script to verify everything works:

```bash
cd backend_threadtake
node test-mockup-job-table.js
```

You should see output like:

```
Testing MockupJob table creation...

1. Testing table existence...
✅ MockupJob table exists! Currently has 0 records.

2. Testing record creation...
✅ Successfully created test job with ID: test-job-169...

3. Testing record retrieval...
✅ Successfully retrieved job: Status=pending, Progress=0

4. Testing record update...
✅ Successfully updated job: Status=processing, Progress=50

5. Testing record deletion...
✅ Successfully deleted test job

🎉 All tests passed! MockupJob table is working correctly.
```

### 4. Test Async Mockup Generation

Once the table is created, test the async mockup generation:

```bash
cd backend_threadtake
node test_async_mockup_generation.js
```

## Troubleshooting

### If SQL execution fails:

- Make sure you have the correct permissions in Supabase
- Check that the `User` table exists (the foreign key references it)
- Verify your Supabase project URL and connection

### If test script fails:

- Ensure the SQL was executed successfully
- Check that your `.env` file has the correct database credentials
- Verify the Prisma schema includes the MockupJob model

## Files Created/Modified

1. **create-mockup-job-table.sql** - SQL script to create the table
2. **test-mockup-job-table.js** - Test script to verify table functionality
3. **setup-mockup-table.js** - Original setup script (already existed)

## Next Steps

After the table is created and tested:

1. The async mockup generation should work without 500 errors
2. You can monitor mockup jobs in the Supabase dashboard
3. The mockup worker will be able to process jobs from the queue

## Database Schema

The `MockupJob` table includes:

- Basic job info (id, status, progress)
- User relationship (userId)
- Design parameters (imageUrl, colors, text, etc.)
- Logo/pattern settings
- Results storage (mockupResults JSONB field)
- Error tracking
- Timestamps
