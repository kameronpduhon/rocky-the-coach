DROP TRIGGER IF EXISTS sync_facts_ins;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_facts_upd;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_facts_del;
--> statement-breakpoint
CREATE TRIGGER sync_facts_ins AFTER INSERT ON facts BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('facts', NEW.client_id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_facts_upd AFTER UPDATE ON facts BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'facts', OLD.client_id, 'del' WHERE OLD.client_id IS NOT NEW.client_id; INSERT INTO changes (table_name, row_key, op) VALUES ('facts', NEW.client_id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_facts_del AFTER DELETE ON facts BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('facts', OLD.client_id, 'del'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_takes_ins;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_takes_upd;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_takes_del;
--> statement-breakpoint
CREATE TRIGGER sync_takes_ins AFTER INSERT ON takes BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('takes', NEW.week_start, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_takes_upd AFTER UPDATE ON takes BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'takes', OLD.week_start, 'del' WHERE OLD.week_start IS NOT NEW.week_start; INSERT INTO changes (table_name, row_key, op) VALUES ('takes', NEW.week_start, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_takes_del AFTER DELETE ON takes BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('takes', OLD.week_start, 'del'); END;
