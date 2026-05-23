CREATE TABLE IF NOT EXISTS Auto_BrunoRepositories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  project_id INT NOT NULL,
  git_url VARCHAR(500) NOT NULL,
  default_branch VARCHAR(100) NOT NULL DEFAULT 'main',
  collection_root VARCHAR(500) NOT NULL DEFAULT '.',
  auth_secret_ref VARCHAR(255) NULL,
  last_sync_commit VARCHAR(100) NULL,
  last_sync_status ENUM('never', 'success', 'failed') NOT NULL DEFAULT 'never',
  last_sync_error TEXT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bruno_repositories_project (project_id),
  INDEX idx_bruno_repositories_status (last_sync_status)
);

CREATE TABLE IF NOT EXISTS Auto_BrunoCollections (
  id INT PRIMARY KEY AUTO_INCREMENT,
  repository_id INT NOT NULL,
  project_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  relative_path VARCHAR(500) NOT NULL,
  format VARCHAR(50) NOT NULL DEFAULT 'bru',
  request_count INT NOT NULL DEFAULT 0,
  environment_count INT NOT NULL DEFAULT 0,
  tags_json JSON NULL,
  last_sync_commit VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bruno_collections_repository (repository_id),
  INDEX idx_bruno_collections_project (project_id)
);

CREATE TABLE IF NOT EXISTS Auto_BrunoRequests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  collection_id INT NOT NULL,
  case_id INT NULL,
  name VARCHAR(255) NOT NULL,
  method VARCHAR(20) NOT NULL,
  relative_path VARCHAR(500) NOT NULL,
  folder_path VARCHAR(500) NULL,
  url_template VARCHAR(1000) NULL,
  tags_json JSON NULL,
  has_tests TINYINT(1) NOT NULL DEFAULT 0,
  has_scripts TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bruno_requests_collection (collection_id),
  INDEX idx_bruno_requests_case (case_id),
  INDEX idx_bruno_requests_method (method)
);

ALTER TABLE Auto_TestCaseTasks
  ADD COLUMN execution_engine ENUM('jenkins', 'bruno') NOT NULL DEFAULT 'jenkins' AFTER trigger_type,
  ADD COLUMN engine_config_json JSON NULL AFTER environment_id;
