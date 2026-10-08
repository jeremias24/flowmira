-- ── NEW ── test helper only, not copied into src/ and never run against a real ipc_centralized.
-- A tiny ipc_centralized for testing Flowmira's access check against the real view definition.
CREATE DATABASE IF NOT EXISTS ipc_centralized;
USE ipc_centralized;

-- DDL as pasted by the owner (2026-10-20)
CREATE TABLE `systems` (
  `id` int NOT NULL AUTO_INCREMENT, `ipc_central_system_id` int DEFAULT NULL, `ipc_portal_system_id` int DEFAULT NULL,
  `system_code` varchar(50) DEFAULT NULL, `system_reference_code` varchar(50) DEFAULT NULL, `name` varchar(510) DEFAULT NULL,
  `description` text, `technology` varchar(50) DEFAULT NULL, `accepted_user_class_id` text, `accepted_user_type_id` text,
  `icon` varchar(510) DEFAULT NULL, `system_group_id` int DEFAULT NULL, `url` varchar(1020) DEFAULT NULL,
  `owner_section_id` int DEFAULT NULL, `is_common` tinyint(1) DEFAULT NULL, `is_allow_proby` tinyint(1) DEFAULT NULL,
  `active_flag` tinyint(1) DEFAULT NULL, `is_on_dashboard` tinyint(1) DEFAULT NULL, `access_activated_flag` tinyint DEFAULT NULL,
  `created_by` int DEFAULT NULL, `created_datetime` datetime DEFAULT NULL, `last_updated_by` int DEFAULT NULL,
  `last_updated_datetime` datetime DEFAULT NULL, PRIMARY KEY (`id`)
);
CREATE TABLE `user_system_accesses` (
  `id` int NOT NULL AUTO_INCREMENT, `user_request_id` int DEFAULT NULL, `user_id` int DEFAULT NULL,
  `employee_id` int DEFAULT NULL, `ipc_portal_user_id` int DEFAULT NULL, `oracle_id` int DEFAULT NULL,
  `user_type_id` int DEFAULT NULL, `system_id` int DEFAULT NULL, `ipc_central_system_id` int DEFAULT NULL,
  `ipc_portal_system_id` int DEFAULT NULL, `status_id` int DEFAULT NULL, `status_code` varchar(30) DEFAULT NULL,
  `created_by` int DEFAULT NULL, `created_datetime` datetime DEFAULT NULL, `last_updated_by` int DEFAULT NULL,
  `last_updated_datetime` datetime DEFAULT NULL, PRIMARY KEY (`id`), UNIQUE KEY `user_system_idx` (`user_id`,`system_id`)
);
-- Columns of user_types as pasted
CREATE TABLE `user_types` (
  `id` int NOT NULL, `system_id` int, `ipc_central_system_id` int, `ipc_portal_system_id` int,
  `ipc_portal_system_user_type_id` int, `name` varchar(60), `option_user_type_id` varchar(100),
  `user_class_id` int, `active_flag` tinyint, PRIMARY KEY (`id`)
);
CREATE TABLE `sections` (`id` int PRIMARY KEY, `name` varchar(200));
CREATE TABLE `statuses` (`id` int PRIMARY KEY, `name` varchar(60));

INSERT INTO user_types (id, name, option_user_type_id, user_class_id, active_flag) VALUES
 (1,'Disable','[2,3,6]',0,1),(2,'Super User','[1,2,3,4,5,6,7,8,9,13]',1,1),(3,'System Owner','[1,4,5,6,13]',1,1),
 (4,'Read-only User','[]',1,1),(5,'Regular User','[]',1,1),(6,'Dealer Admin','[1,7,8]',2,1),(7,'Dealer Staff','[]',2,1),
 (8,'Dealer Technician','[]',2,1),(9,'Copy-only User','[]',1,1),(10,'Security-only User','[]',1,1),(11,'HR','[]',1,1),
 (12,'Receptionist','[]',1,1),(13,'Administrator','[]',1,1);
INSERT INTO sections VALUES (5,'GAD-CSS'),(222,'Owner section');
INSERT INTO statuses VALUES (1,'Active'),(4,'Inactive');
INSERT INTO systems (id, system_code, system_reference_code, name, technology, accepted_user_class_id, accepted_user_type_id, url, owner_section_id, active_flag) VALUES
 (37,'ATLAS','SYS-005-ATLAS','Automated Travel Liaise and Allocation System','laravel','[1]','[2,3,5,13]','http://127.0.0.1:3002/authenticate/{attribute}',5,1),
 (39,'FM','SYS-222-FM','Flowmira','laravel','[1]','[2,3,5,13]','http://localhost:8099/authenticate/{attribute}',222,1);
-- user ids = stub_ums.py ids
INSERT INTO user_system_accesses (user_id, user_type_id, system_id, status_id) VALUES
 (1, 3, 39, 1),    -- owner: System Owner
 (2, 2, 39, 1),    -- super: Super User
 (3, 5, 39, 1),    -- regular: Regular User
 (5, 13, 39, 1),   -- admin: Administrator
 (6, 3, 37, 1),    -- atlas_owner: Atlas only
 (7, 3, 39, 4),    -- inactive: System Owner but status 4 (not in 1,2,3,24,25)
 (8, 3, 39, 1);    -- promoted: UMS's answer says Regular User, this table says System Owner

-- The owner's view, unchanged except CREATE instead of ALTER and no DEFINER.
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `user_system_active_accesses_vw` AS
SELECT
  `usa`.`user_id` AS `user_id`, `usa`.`employee_id` AS `employee_id`, `usa`.`ipc_portal_user_id` AS `ipc_portal_user_id`,
  `sy`.`owner_section_id` AS `owner_section_id`, `sc`.`name` AS `owner_section`, `usa`.`user_type_id` AS `user_type_id`,
  (CASE WHEN (`usa`.`ipc_central_system_id` IS NOT NULL) THEN `ut_ics`.`name` WHEN (`usa`.`ipc_portal_system_id` IS NOT NULL) THEN `ut_ips`.`name` WHEN (`usa`.`system_id` IS NOT NULL) THEN `ut_s`.`name` ELSE `ut_sy`.`name` END) AS `user_type`,
  `ut_ics`.`option_user_type_id` AS `option_user_type_id`, `usa`.`system_id` AS `system_id`, `sy`.`system_code` AS `system_code`,
  `sy`.`system_reference_code` AS `system_reference_code`, `sy`.`ipc_central_system_id` AS `ipc_central_system_id`,
  `sy`.`ipc_portal_system_id` AS `ipc_portal_system_id`, `sy`.`name` AS `system`, `sy`.`is_on_dashboard` AS `is_on_dashboard`,
  `sy`.`technology` AS `technology`, `sy`.`description` AS `description`, `sy`.`accepted_user_class_id` AS `accepted_user_class_id`,
  `sy`.`accepted_user_type_id` AS `accepted_user_type_id`, `sy`.`icon` AS `icon`, `sy`.`url` AS `url`,
  `usa`.`status_id` AS `status_id`, 'Active' AS `status`
FROM (((((((`user_system_accesses` `usa`
  LEFT JOIN `user_types` `ut_ics` ON ((`usa`.`user_type_id` = `ut_ics`.`id`)))
  LEFT JOIN `user_types` `ut_ips` ON (((`usa`.`user_type_id` = `ut_ips`.`ipc_portal_system_user_type_id`) AND (`ut_ips`.`ipc_portal_system_id` IS NOT NULL))))
  LEFT JOIN `user_types` `ut_s` ON (((`usa`.`user_type_id` = `ut_s`.`id`) AND (`ut_ips`.`ipc_portal_system_id` IS NULL))))
  LEFT JOIN `user_types` `ut_sy` ON ((`usa`.`user_type_id` = `ut_sy`.`id`)))
  LEFT JOIN `systems` `sy` ON ((`usa`.`system_id` = `sy`.`id`)))
  LEFT JOIN `sections` `sc` ON ((`sy`.`owner_section_id` = `sc`.`id`)))
  LEFT JOIN `statuses` `s` ON ((`usa`.`status_id` = `s`.`id`)))
WHERE ((`usa`.`status_id` IN (1,2,3,24,25)) AND (`sy`.`active_flag` = 1))
ORDER BY `sy`.`owner_section_id`, `sy`.`system_group_id`, `usa`.`id` DESC;

-- The kind of account Flowmira should use: SELECT on the view only.
CREATE USER 'flowmira_ro'@'%' IDENTIFIED BY 'test-only-ro-pw';
GRANT SELECT ON ipc_centralized.user_system_active_accesses_vw TO 'flowmira_ro'@'%';
