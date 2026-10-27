UPDATE workout_sessions SET lifts = (
  SELECT json_group_array(json_object('position', j.key, 'exercise', j.value, 'repMin', 8, 'repMax', 12, 'from', 'added'))
  FROM json_each(workout_sessions.exercises) AS j
) WHERE template_id = 'custom' AND exercises IS NOT NULL AND lifts IS NULL;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_workout_sessions_ins;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_workout_sessions_upd;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_workout_sessions_del;
--> statement-breakpoint
CREATE TRIGGER sync_workout_sessions_ins AFTER INSERT ON workout_sessions BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('workout_sessions', COALESCE(NEW.client_id, 'id:' || NEW.id), 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_workout_sessions_upd AFTER UPDATE ON workout_sessions BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'workout_sessions', COALESCE(OLD.client_id, 'id:' || OLD.id), 'del' WHERE COALESCE(OLD.client_id, 'id:' || OLD.id) IS NOT COALESCE(NEW.client_id, 'id:' || NEW.id); INSERT INTO changes (table_name, row_key, op) VALUES ('workout_sessions', COALESCE(NEW.client_id, 'id:' || NEW.id), 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_workout_sessions_del AFTER DELETE ON workout_sessions BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('workout_sessions', COALESCE(OLD.client_id, 'id:' || OLD.id), 'del'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_exercise_checks_ins;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_exercise_checks_upd;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_exercise_checks_del;
--> statement-breakpoint
CREATE TRIGGER sync_exercise_checks_ins AFTER INSERT ON exercise_checks BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('exercise_checks', NEW.session_key || '|' || NEW.exercise_id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_exercise_checks_upd AFTER UPDATE ON exercise_checks BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'exercise_checks', OLD.session_key || '|' || OLD.exercise_id, 'del' WHERE OLD.session_key || '|' || OLD.exercise_id IS NOT NEW.session_key || '|' || NEW.exercise_id; INSERT INTO changes (table_name, row_key, op) VALUES ('exercise_checks', NEW.session_key || '|' || NEW.exercise_id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_exercise_checks_del AFTER DELETE ON exercise_checks BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('exercise_checks', OLD.session_key || '|' || OLD.exercise_id, 'del'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_exercise_notes_ins;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_exercise_notes_upd;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_exercise_notes_del;
--> statement-breakpoint
CREATE TRIGGER sync_exercise_notes_ins AFTER INSERT ON exercise_notes BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('exercise_notes', NEW.exercise_id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_exercise_notes_upd AFTER UPDATE ON exercise_notes BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'exercise_notes', OLD.exercise_id, 'del' WHERE OLD.exercise_id IS NOT NEW.exercise_id; INSERT INTO changes (table_name, row_key, op) VALUES ('exercise_notes', NEW.exercise_id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_exercise_notes_del AFTER DELETE ON exercise_notes BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('exercise_notes', OLD.exercise_id, 'del'); END;
