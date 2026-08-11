ALTER TABLE projects ADD COLUMN target_date TEXT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN sort_order INTEGER;

UPDATE projects
SET sort_order = -id
WHERE sort_order IS NULL;
