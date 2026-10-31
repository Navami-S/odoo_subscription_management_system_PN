# Brightloop Database Notes & Schema Justifications

## 1. Engine & Environment Verification

* **RDBMS:** MySQL Community Server (InnoDB Engine, `utf8mb4` character set, `utf8mb4_0900_ai_ci` collation)
* **Verified Version:** `8.0.46`
* **Version Verification Query:**
  ```sql
  SELECT VERSION();
  -- Output: 8.0.46
  ```
* **Why 8.0.16+ is Mandatory:** MySQL versions prior to 8.0.16 parse `CHECK` constraints without error but silently ignore them during runtime inserts and updates. Running version 8.0.46 guarantees that all domain integrity rules (e.g., positive pricing, date range consistency, percent bounds) are actively enforced by the storage engine.
* **Storage Engine:** InnoDB is enforced across all tables to support ACID transactions, row-level locking (`SELECT ... FOR UPDATE`), and foreign key constraints.

---

## 2. Table Rationale & Constraint Defense

*(This section will be populated in Phase 1 as tables are defined and migrated)*
