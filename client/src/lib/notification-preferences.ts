export type NotificationCategoryPreferences = {
  notices?: boolean;
  mealReminders?: boolean;
  deposits?: boolean;
  settlements?: boolean;
  mealOff?: boolean;
};

export type NotificationPreferences = {
  global?: boolean;
  categories?: NotificationCategoryPreferences;
  reminderTime: string;
};
