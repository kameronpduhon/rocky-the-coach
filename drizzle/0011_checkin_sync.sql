DROP TRIGGER IF EXISTS sync_lift_drops_ins;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_lift_drops_upd;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_lift_drops_del;
--> statement-breakpoint
CREATE TRIGGER sync_lift_drops_ins AFTER INSERT ON lift_drops BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('lift_drops', NEW.exercise_id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_lift_drops_upd AFTER UPDATE ON lift_drops BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'lift_drops', OLD.exercise_id, 'del' WHERE OLD.exercise_id IS NOT NEW.exercise_id; INSERT INTO changes (table_name, row_key, op) VALUES ('lift_drops', NEW.exercise_id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_lift_drops_del AFTER DELETE ON lift_drops BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('lift_drops', OLD.exercise_id, 'del'); END;
