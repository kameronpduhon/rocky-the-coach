DROP TRIGGER IF EXISTS sync_batches_ins;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_batches_upd;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_batches_del;
--> statement-breakpoint
CREATE TRIGGER sync_batches_ins AFTER INSERT ON batches BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('batches', COALESCE(NEW.client_id, 'id:' || NEW.id), 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_batches_upd AFTER UPDATE ON batches BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'batches', COALESCE(OLD.client_id, 'id:' || OLD.id), 'del' WHERE COALESCE(OLD.client_id, 'id:' || OLD.id) IS NOT COALESCE(NEW.client_id, 'id:' || NEW.id); INSERT INTO changes (table_name, row_key, op) VALUES ('batches', COALESCE(NEW.client_id, 'id:' || NEW.id), 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_batches_del AFTER DELETE ON batches BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('batches', COALESCE(OLD.client_id, 'id:' || OLD.id), 'del'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_usual_orders_ins;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_usual_orders_upd;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_usual_orders_del;
--> statement-breakpoint
CREATE TRIGGER sync_usual_orders_ins AFTER INSERT ON usual_orders BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('usual_orders', NEW.client_id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_usual_orders_upd AFTER UPDATE ON usual_orders BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'usual_orders', OLD.client_id, 'del' WHERE OLD.client_id IS NOT NEW.client_id; INSERT INTO changes (table_name, row_key, op) VALUES ('usual_orders', NEW.client_id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_usual_orders_del AFTER DELETE ON usual_orders BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('usual_orders', OLD.client_id, 'del'); END;
--> statement-breakpoint
INSERT INTO usual_orders (client_id, name, category, kcal, protein_g, relaxed, uses, created_at) VALUES
  ('usual-restaurant-meal', 'Restaurant meal', 'meal', 900, 50, 1, 0, '2026-10-27T00:00:00.000Z'),
  ('usual-ranch-water', 'Ranch Water', 'drink', 100, 0, 0, 0, '2026-10-27T00:00:00.000Z')
ON CONFLICT (client_id) DO NOTHING;
