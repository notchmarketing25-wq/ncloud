<?php
/** Database tables of Notch Cloud Services (MySQL / MariaDB). Safe to run again: every statement is IF NOT EXISTS. */
if (!defined('NC_SCHEMA_OK')) { define('NC_SCHEMA_OK', 1); }

function nc_schema_sql() {
    $opt = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    return array(
        'CREATE TABLE IF NOT EXISTS nc_users (seq BIGINT AUTO_INCREMENT PRIMARY KEY, id VARCHAR(32) NOT NULL, email VARCHAR(190) NOT NULL, role VARCHAR(10) NOT NULL, data MEDIUMTEXT NOT NULL, UNIQUE KEY u_id (id), UNIQUE KEY u_email (email))' . $opt,
        'CREATE TABLE IF NOT EXISTS nc_items (seq BIGINT AUTO_INCREMENT PRIMARY KEY, id VARCHAR(32) NOT NULL, res VARCHAR(20) NOT NULL, uid VARCHAR(32) NOT NULL, data MEDIUMTEXT NOT NULL, UNIQUE KEY u_id (id), KEY k_res (res, uid))' . $opt,
        'CREATE TABLE IF NOT EXISTS nc_tickets (seq BIGINT AUTO_INCREMENT PRIMARY KEY, id VARCHAR(32) NOT NULL, uid VARCHAR(32) NOT NULL, data MEDIUMTEXT NOT NULL, UNIQUE KEY u_id (id), KEY k_uid (uid))' . $opt,
        'CREATE TABLE IF NOT EXISTS nc_leads (seq BIGINT AUTO_INCREMENT PRIMARY KEY, id VARCHAR(32) NOT NULL, data MEDIUMTEXT NOT NULL, UNIQUE KEY u_id (id))' . $opt,
        'CREATE TABLE IF NOT EXISTS nc_log (seq BIGINT AUTO_INCREMENT PRIMARY KEY, data TEXT NOT NULL)' . $opt,
        'CREATE TABLE IF NOT EXISTS nc_meta (k VARCHAR(64) NOT NULL PRIMARY KEY, v MEDIUMTEXT NOT NULL)' . $opt,
        'CREATE TABLE IF NOT EXISTS nc_attempts (k VARCHAR(80) NOT NULL PRIMARY KEY, v TEXT NOT NULL)' . $opt,
    );
}

/** Creates every table. Throws PDOException on failure. */
function nc_schema(PDO $pdo) {
    foreach (nc_schema_sql() as $sql) { $pdo->exec($sql); }
}
