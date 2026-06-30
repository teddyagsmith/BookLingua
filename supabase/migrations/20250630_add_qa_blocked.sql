-- Add qa_blocked status check constraint (if using check constraint)
-- If the orders.status column uses a CHECK constraint, this may need manual update
-- This migration is a no-op if status is just a text column without constraint

-- Add qa_errors column for storing gate/compare failure details
alter table orders add column if not exists qa_errors text;
