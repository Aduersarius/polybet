-- Add search_vector column to Event table
ALTER TABLE "Event" ADD COLUMN "searchVector" tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX "Event_searchVector_idx" ON "Event" USING gin("searchVector");

-- Create function to update search vector
CREATE OR REPLACE FUNCTION update_event_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', array_to_string(NEW.categories, ' ')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update search vector on insert/update
CREATE TRIGGER trigger_update_event_search_vector
  BEFORE INSERT OR UPDATE ON "Event"
  FOR EACH ROW EXECUTE FUNCTION update_event_search_vector();

-- Populate search vectors for existing events
UPDATE "Event" SET "searchVector" =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', array_to_string(categories, ' ')), 'C');