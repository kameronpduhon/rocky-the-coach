CREATE TRIGGER sync_meal_state_ins AFTER INSERT ON meal_state BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('meal_state', NEW.slug, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_meal_state_upd AFTER UPDATE ON meal_state BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'meal_state', OLD.slug, 'del' WHERE OLD.slug IS NOT NEW.slug; INSERT INTO changes (table_name, row_key, op) VALUES ('meal_state', NEW.slug, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_meal_state_del AFTER DELETE ON meal_state BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('meal_state', OLD.slug, 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_planned_meals_ins AFTER INSERT ON planned_meals BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('planned_meals', NEW.date || '|' || NEW.slot, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_planned_meals_upd AFTER UPDATE ON planned_meals BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'planned_meals', OLD.date || '|' || OLD.slot, 'del' WHERE OLD.date || '|' || OLD.slot IS NOT NEW.date || '|' || NEW.slot; INSERT INTO changes (table_name, row_key, op) VALUES ('planned_meals', NEW.date || '|' || NEW.slot, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_planned_meals_del AFTER DELETE ON planned_meals BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('planned_meals', OLD.date || '|' || OLD.slot, 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_meal_logs_ins AFTER INSERT ON meal_logs BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('meal_logs', COALESCE(NEW.client_id, 'id:' || NEW.id), 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_meal_logs_upd AFTER UPDATE ON meal_logs BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'meal_logs', COALESCE(OLD.client_id, 'id:' || OLD.id), 'del' WHERE COALESCE(OLD.client_id, 'id:' || OLD.id) IS NOT COALESCE(NEW.client_id, 'id:' || NEW.id); INSERT INTO changes (table_name, row_key, op) VALUES ('meal_logs', COALESCE(NEW.client_id, 'id:' || NEW.id), 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_meal_logs_del AFTER DELETE ON meal_logs BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('meal_logs', COALESCE(OLD.client_id, 'id:' || OLD.id), 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_batches_ins AFTER INSERT ON batches BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('batches', 'id:' || NEW.id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_batches_upd AFTER UPDATE ON batches BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'batches', 'id:' || OLD.id, 'del' WHERE 'id:' || OLD.id IS NOT 'id:' || NEW.id; INSERT INTO changes (table_name, row_key, op) VALUES ('batches', 'id:' || NEW.id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_batches_del AFTER DELETE ON batches BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('batches', 'id:' || OLD.id, 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_workout_sessions_ins AFTER INSERT ON workout_sessions BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('workout_sessions', 'id:' || NEW.id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_workout_sessions_upd AFTER UPDATE ON workout_sessions BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'workout_sessions', 'id:' || OLD.id, 'del' WHERE 'id:' || OLD.id IS NOT 'id:' || NEW.id; INSERT INTO changes (table_name, row_key, op) VALUES ('workout_sessions', 'id:' || NEW.id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_workout_sessions_del AFTER DELETE ON workout_sessions BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('workout_sessions', 'id:' || OLD.id, 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_exercise_checks_ins AFTER INSERT ON exercise_checks BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('exercise_checks', NEW.session_id || '|' || NEW.exercise_id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_exercise_checks_upd AFTER UPDATE ON exercise_checks BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'exercise_checks', OLD.session_id || '|' || OLD.exercise_id, 'del' WHERE OLD.session_id || '|' || OLD.exercise_id IS NOT NEW.session_id || '|' || NEW.exercise_id; INSERT INTO changes (table_name, row_key, op) VALUES ('exercise_checks', NEW.session_id || '|' || NEW.exercise_id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_exercise_checks_del AFTER DELETE ON exercise_checks BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('exercise_checks', OLD.session_id || '|' || OLD.exercise_id, 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_set_logs_ins AFTER INSERT ON set_logs BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('set_logs', COALESCE(NEW.client_id, 'id:' || NEW.id), 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_set_logs_upd AFTER UPDATE ON set_logs BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'set_logs', COALESCE(OLD.client_id, 'id:' || OLD.id), 'del' WHERE COALESCE(OLD.client_id, 'id:' || OLD.id) IS NOT COALESCE(NEW.client_id, 'id:' || NEW.id); INSERT INTO changes (table_name, row_key, op) VALUES ('set_logs', COALESCE(NEW.client_id, 'id:' || NEW.id), 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_set_logs_del AFTER DELETE ON set_logs BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('set_logs', COALESCE(OLD.client_id, 'id:' || OLD.id), 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_exercise_overrides_ins AFTER INSERT ON exercise_overrides BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('exercise_overrides', NEW.template_id || '|' || NEW.position, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_exercise_overrides_upd AFTER UPDATE ON exercise_overrides BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'exercise_overrides', OLD.template_id || '|' || OLD.position, 'del' WHERE OLD.template_id || '|' || OLD.position IS NOT NEW.template_id || '|' || NEW.position; INSERT INTO changes (table_name, row_key, op) VALUES ('exercise_overrides', NEW.template_id || '|' || NEW.position, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_exercise_overrides_del AFTER DELETE ON exercise_overrides BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('exercise_overrides', OLD.template_id || '|' || OLD.position, 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_exercise_swaps_ins AFTER INSERT ON exercise_swaps BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('exercise_swaps', NEW.date || '|' || NEW.template_id || '|' || NEW.position, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_exercise_swaps_upd AFTER UPDATE ON exercise_swaps BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'exercise_swaps', OLD.date || '|' || OLD.template_id || '|' || OLD.position, 'del' WHERE OLD.date || '|' || OLD.template_id || '|' || OLD.position IS NOT NEW.date || '|' || NEW.template_id || '|' || NEW.position; INSERT INTO changes (table_name, row_key, op) VALUES ('exercise_swaps', NEW.date || '|' || NEW.template_id || '|' || NEW.position, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_exercise_swaps_del AFTER DELETE ON exercise_swaps BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('exercise_swaps', OLD.date || '|' || OLD.template_id || '|' || OLD.position, 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_schedule_moves_ins AFTER INSERT ON schedule_moves BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('schedule_moves', NEW.date, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_schedule_moves_upd AFTER UPDATE ON schedule_moves BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'schedule_moves', OLD.date, 'del' WHERE OLD.date IS NOT NEW.date; INSERT INTO changes (table_name, row_key, op) VALUES ('schedule_moves', NEW.date, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_schedule_moves_del AFTER DELETE ON schedule_moves BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('schedule_moves', OLD.date, 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_weigh_ins_ins AFTER INSERT ON weigh_ins BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('weigh_ins', NEW.date, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_weigh_ins_upd AFTER UPDATE ON weigh_ins BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'weigh_ins', OLD.date, 'del' WHERE OLD.date IS NOT NEW.date; INSERT INTO changes (table_name, row_key, op) VALUES ('weigh_ins', NEW.date, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_weigh_ins_del AFTER DELETE ON weigh_ins BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('weigh_ins', OLD.date, 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_waist_logs_ins AFTER INSERT ON waist_logs BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('waist_logs', NEW.date, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_waist_logs_upd AFTER UPDATE ON waist_logs BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'waist_logs', OLD.date, 'del' WHERE OLD.date IS NOT NEW.date; INSERT INTO changes (table_name, row_key, op) VALUES ('waist_logs', NEW.date, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_waist_logs_del AFTER DELETE ON waist_logs BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('waist_logs', OLD.date, 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_steps_daily_ins AFTER INSERT ON steps_daily BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('steps_daily', NEW.date, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_steps_daily_upd AFTER UPDATE ON steps_daily BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'steps_daily', OLD.date, 'del' WHERE OLD.date IS NOT NEW.date; INSERT INTO changes (table_name, row_key, op) VALUES ('steps_daily', NEW.date, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_steps_daily_del AFTER DELETE ON steps_daily BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('steps_daily', OLD.date, 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_targets_ins AFTER INSERT ON targets BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('targets', NEW.effective_from, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_targets_upd AFTER UPDATE ON targets BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'targets', OLD.effective_from, 'del' WHERE OLD.effective_from IS NOT NEW.effective_from; INSERT INTO changes (table_name, row_key, op) VALUES ('targets', NEW.effective_from, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_targets_del AFTER DELETE ON targets BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('targets', OLD.effective_from, 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_check_ins_ins AFTER INSERT ON check_ins BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('check_ins', NEW.week_start, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_check_ins_upd AFTER UPDATE ON check_ins BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'check_ins', OLD.week_start, 'del' WHERE OLD.week_start IS NOT NEW.week_start; INSERT INTO changes (table_name, row_key, op) VALUES ('check_ins', NEW.week_start, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_check_ins_del AFTER DELETE ON check_ins BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('check_ins', OLD.week_start, 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_reminder_settings_ins AFTER INSERT ON reminder_settings BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('reminder_settings', NEW.kind, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_reminder_settings_upd AFTER UPDATE ON reminder_settings BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'reminder_settings', OLD.kind, 'del' WHERE OLD.kind IS NOT NEW.kind; INSERT INTO changes (table_name, row_key, op) VALUES ('reminder_settings', NEW.kind, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_reminder_settings_del AFTER DELETE ON reminder_settings BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('reminder_settings', OLD.kind, 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_grocery_checks_ins AFTER INSERT ON grocery_checks BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('grocery_checks', NEW.week_start || '|' || NEW.food_id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_grocery_checks_upd AFTER UPDATE ON grocery_checks BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'grocery_checks', OLD.week_start || '|' || OLD.food_id, 'del' WHERE OLD.week_start || '|' || OLD.food_id IS NOT NEW.week_start || '|' || NEW.food_id; INSERT INTO changes (table_name, row_key, op) VALUES ('grocery_checks', NEW.week_start || '|' || NEW.food_id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_grocery_checks_del AFTER DELETE ON grocery_checks BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('grocery_checks', OLD.week_start || '|' || OLD.food_id, 'del'); END;
--> statement-breakpoint
CREATE TRIGGER sync_profile_ins AFTER INSERT ON profile BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('profile', NEW.id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_profile_upd AFTER UPDATE ON profile BEGIN INSERT INTO changes (table_name, row_key, op) SELECT 'profile', OLD.id, 'del' WHERE OLD.id IS NOT NEW.id; INSERT INTO changes (table_name, row_key, op) VALUES ('profile', NEW.id, 'put'); END;
--> statement-breakpoint
CREATE TRIGGER sync_profile_del AFTER DELETE ON profile BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('profile', OLD.id, 'del'); END;
