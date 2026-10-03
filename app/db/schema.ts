import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const bool = (name: string) => integer(name, { mode: "boolean" });

export const mealState = sqliteTable("meal_state", {
  slug: text("slug").primaryKey(),
  photoKey: text("photo_key"),
  restedUntil: text("rested_until"),
});

export const plannedMeals = sqliteTable(
  "planned_meals",
  {
    date: text("date").notNull(),
    slot: text("slot").notNull(),
    mealSlug: text("meal_slug").notNull(),
    swapped: bool("swapped").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.date, t.slot] })],
);

export const mealLogs = sqliteTable(
  "meal_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    slot: text("slot"),
    mealSlug: text("meal_slug"),
    name: text("name").notNull(),
    category: text("category").notNull(),
    kcal: integer("kcal").notNull(),
    proteinG: integer("protein_g").notNull(),
    relaxed: bool("relaxed").notNull().default(false),
    portions: integer("portions").notNull().default(1),
    loggedAt: text("logged_at").notNull(),
  },
  (t) => [index("meal_logs_date").on(t.date)],
);

export const batches = sqliteTable("batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mealSlug: text("meal_slug").notNull(),
  portions: integer("portions").notNull(),
  cookedWeightG: integer("cooked_weight_g").notNull(),
  portionG: integer("portion_g").notNull(),
  createdOn: text("created_on").notNull(),
  portionsLeft: integer("portions_left").notNull(),
});

export const workoutSessions = sqliteTable(
  "workout_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    templateId: text("template_id").notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
  },
  (t) => [index("workout_sessions_date").on(t.date)],
);

export const setLogs = sqliteTable(
  "set_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id").notNull(),
    exerciseId: text("exercise_id").notNull(),
    position: integer("position").notNull(),
    setNumber: integer("set_number").notNull(),
    weightLb: real("weight_lb").notNull(),
    reps: integer("reps").notNull(),
    loggedAt: text("logged_at").notNull(),
  },
  (t) => [index("set_logs_exercise").on(t.exerciseId), index("set_logs_session").on(t.sessionId)],
);

export const exerciseOverrides = sqliteTable(
  "exercise_overrides",
  {
    templateId: text("template_id").notNull(),
    position: integer("position").notNull(),
    exerciseId: text("exercise_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.templateId, t.position] })],
);

export const exerciseSwaps = sqliteTable(
  "exercise_swaps",
  {
    date: text("date").notNull(),
    templateId: text("template_id").notNull(),
    position: integer("position").notNull(),
    exerciseId: text("exercise_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.templateId, t.position] })],
);

export const weighIns = sqliteTable("weigh_ins", {
  date: text("date").primaryKey(),
  weightLb: real("weight_lb").notNull(),
  loggedAt: text("logged_at").notNull(),
});

export const waistLogs = sqliteTable("waist_logs", {
  date: text("date").primaryKey(),
  inches: real("inches").notNull(),
});

export const stepsDaily = sqliteTable("steps_daily", {
  date: text("date").primaryKey(),
  steps: integer("steps").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const targets = sqliteTable("targets", {
  effectiveFrom: text("effective_from").primaryKey(),
  kcal: integer("kcal").notNull(),
  proteinG: integer("protein_g").notNull(),
  stepGoal: integer("step_goal").notNull(),
});

export const checkIns = sqliteTable("check_ins", {
  weekStart: text("week_start").primaryKey(),
  avgWeight: real("avg_weight"),
  change: real("change"),
  adherence: integer("adherence").notNull(),
  outcome: text("outcome").notNull(),
  completedAt: text("completed_at").notNull(),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: text("created_at").notNull(),
});

export const reminderSettings = sqliteTable("reminder_settings", {
  kind: text("kind").primaryKey(),
  enabled: bool("enabled").notNull(),
  time: text("time").notNull(),
});

export const notificationsSent = sqliteTable(
  "notifications_sent",
  {
    kind: text("kind").notNull(),
    date: text("date").notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.date] })],
);

export const loginAttempts = sqliteTable("login_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ip: text("ip").notNull(),
  attemptedAt: text("attempted_at").notNull(),
});

export const groceryChecks = sqliteTable(
  "grocery_checks",
  {
    weekStart: text("week_start").notNull(),
    foodId: text("food_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.weekStart, t.foodId] })],
);
