-- Add pipeline_version column to files table for cache invalidation
alter table files add column if not exists pipeline_version text;
