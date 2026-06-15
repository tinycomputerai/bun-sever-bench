export type SuiteSummary = {
  agent_id: string;
  total_tasks: number;
  passed: number;
  failed: number;
  average_score: number;
  total_wall_time_ms: number;
  started_at: string;
  completed_at: string;
};

export type LeaderboardEntry = {
  task_id: string;
  score: number;
  duration_ms: number;
  status: string;
  run_id: string;
};

export type SuiteLeaderboard = {
  agent_id: string;
  entries: LeaderboardEntry[];
};

export type SuiteResult = {
  summary: SuiteSummary;
  leaderboard: SuiteLeaderboard;
  outputDir: string;
};
