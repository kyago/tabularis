use crate::drivers::driver_trait::{DatabaseDriver, SqlDialect};
use crate::models::{
    ConnectionParams, ForeignKey, Index, RoutineInfo, TableColumn, TableInfo, TableSchema,
    TriggerInfo, ViewInfo,
};
use crate::runtime::RuntimeContext;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use uuid::Uuid;

#[derive(Debug)]
pub enum MetadataCommand {
    GetConnectionMetadata {
        connection_id: String,
    },
    GetAvailableDatabases {
        connection_id: String,
    },
    GetSchemas {
        connection_id: String,
        database: Option<String>,
    },
    GetTables {
        connection_id: String,
        schema: Option<String>,
        database: Option<String>,
    },
    GetColumns {
        connection_id: String,
        table_name: String,
        schema: Option<String>,
        database: Option<String>,
    },
    GetApproximateRowCount {
        connection_id: String,
        table_name: String,
        schema: Option<String>,
        database: Option<String>,
    },
    GetForeignKeys {
        connection_id: String,
        table_name: String,
        schema: Option<String>,
        database: Option<String>,
    },
    GetIndexes {
        connection_id: String,
        table_name: String,
        schema: Option<String>,
        database: Option<String>,
    },
    GetViews {
        connection_id: String,
        schema: Option<String>,
        database: Option<String>,
    },
    GetViewColumns {
        connection_id: String,
        view_name: String,
        schema: Option<String>,
        database: Option<String>,
    },
    GetMaterializedViews {
        connection_id: String,
        schema: Option<String>,
        database: Option<String>,
    },
    GetMaterializedViewColumns {
        connection_id: String,
        view_name: String,
        schema: Option<String>,
        database: Option<String>,
    },
    GetMaterializedViewDefinition {
        connection_id: String,
        view_name: String,
        schema: Option<String>,
        database: Option<String>,
    },
    GetRoutines {
        connection_id: String,
        schema: Option<String>,
        database: Option<String>,
    },
    GetTriggers {
        connection_id: String,
        schema: Option<String>,
        database: Option<String>,
    },
    GetSchemaSnapshot {
        connection_id: String,
        schema: Option<String>,
        database: Option<String>,
    },
    GetSelectedSchemas {
        connection_id: String,
        database: Option<String>,
    },
    SetSelectedSchemas {
        connection_id: String,
        schemas: Vec<String>,
        database: Option<String>,
    },
    GetSchemaPreference {
        connection_id: String,
        database: Option<String>,
    },
    SetSchemaPreference {
        connection_id: String,
        schema: String,
        database: Option<String>,
    },
}

pub async fn execute(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    command: MetadataCommand,
) -> Result<Value, String> {
    match command {
        MetadataCommand::GetConnectionMetadata { connection_id } => {
            json(get_connection_metadata(runtime, session_id, &connection_id).await?)
        }
        MetadataCommand::GetAvailableDatabases { connection_id } => {
            json(get_available_databases(runtime, session_id, &connection_id).await?)
        }
        MetadataCommand::GetSchemas {
            connection_id,
            database,
        } => json(get_schemas(runtime, session_id, &connection_id, database).await?),
        MetadataCommand::GetTables {
            connection_id,
            schema,
            database,
        } => json(get_tables(runtime, session_id, &connection_id, schema, database).await?),
        MetadataCommand::GetColumns {
            connection_id,
            table_name,
            schema,
            database,
        } => json(
            get_columns(
                runtime,
                session_id,
                &connection_id,
                table_name,
                schema,
                database,
            )
            .await?,
        ),
        MetadataCommand::GetApproximateRowCount {
            connection_id,
            table_name,
            schema,
            database,
        } => json(
            get_approximate_row_count(
                runtime,
                session_id,
                &connection_id,
                table_name,
                schema,
                database,
            )
            .await?,
        ),
        MetadataCommand::GetForeignKeys {
            connection_id,
            table_name,
            schema,
            database,
        } => json(
            get_foreign_keys(
                runtime,
                session_id,
                &connection_id,
                table_name,
                schema,
                database,
            )
            .await?,
        ),
        MetadataCommand::GetIndexes {
            connection_id,
            table_name,
            schema,
            database,
        } => json(
            get_indexes(
                runtime,
                session_id,
                &connection_id,
                table_name,
                schema,
                database,
            )
            .await?,
        ),
        MetadataCommand::GetViews {
            connection_id,
            schema,
            database,
        } => json(get_views(runtime, session_id, &connection_id, schema, database).await?),
        MetadataCommand::GetViewColumns {
            connection_id,
            view_name,
            schema,
            database,
        } => json(
            get_view_columns(
                runtime,
                session_id,
                &connection_id,
                view_name,
                schema,
                database,
            )
            .await?,
        ),
        MetadataCommand::GetMaterializedViews {
            connection_id,
            schema,
            database,
        } => json(
            get_materialized_views(runtime, session_id, &connection_id, schema, database).await?,
        ),
        MetadataCommand::GetMaterializedViewColumns {
            connection_id,
            view_name,
            schema,
            database,
        } => json(
            get_materialized_view_columns(
                runtime,
                session_id,
                &connection_id,
                view_name,
                schema,
                database,
            )
            .await?,
        ),
        MetadataCommand::GetMaterializedViewDefinition {
            connection_id,
            view_name,
            schema,
            database,
        } => json(
            get_materialized_view_definition(
                runtime,
                session_id,
                &connection_id,
                view_name,
                schema,
                database,
            )
            .await?,
        ),
        MetadataCommand::GetRoutines {
            connection_id,
            schema,
            database,
        } => json(get_routines(runtime, session_id, &connection_id, schema, database).await?),
        MetadataCommand::GetTriggers {
            connection_id,
            schema,
            database,
        } => json(get_triggers(runtime, session_id, &connection_id, schema, database).await?),
        MetadataCommand::GetSchemaSnapshot {
            connection_id,
            schema,
            database,
        } => {
            json(get_schema_snapshot(runtime, session_id, &connection_id, schema, database).await?)
        }
        MetadataCommand::GetSelectedSchemas {
            connection_id,
            database,
        } => json(get_selected_schemas(runtime, &connection_id, database)),
        MetadataCommand::SetSelectedSchemas {
            connection_id,
            schemas,
            database,
        } => {
            set_selected_schemas(runtime, connection_id, schemas, database)?;
            Ok(Value::Null)
        }
        MetadataCommand::GetSchemaPreference {
            connection_id,
            database,
        } => json(get_schema_preference(runtime, &connection_id, database)),
        MetadataCommand::SetSchemaPreference {
            connection_id,
            schema,
            database,
        } => {
            set_schema_preference(runtime, connection_id, schema, database)?;
            Ok(Value::Null)
        }
    }
}

async fn driver_and_params(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    database: Option<String>,
) -> Result<(Arc<dyn DatabaseDriver>, ConnectionParams), String> {
    let runtime_for_resolution = runtime.clone();
    let connection_id_for_resolution = connection_id.to_string();
    let (_driver_id, mut params) = tokio::task::spawn_blocking(move || {
        crate::application::connections::resolve_saved_connection_params(
            &runtime_for_resolution,
            session_id,
            &connection_id_for_resolution,
        )
    })
    .await
    .map_err(|error| error.to_string())??;
    if let Some(db) = database.filter(|db| !db.is_empty()) {
        params.database = crate::models::DatabaseSelection::Single(db);
    }
    let driver = crate::drivers::registry::get_connection_driver(&params).await?;
    Ok((driver, params))
}

/// Capabilities and type catalog reported by a connection's driver. Only
/// plugins that discover them per connection answer; static drivers return
/// `None` so the frontend keeps using their manifest.
pub async fn get_connection_metadata(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
) -> Result<Option<crate::plugins::connection_metadata::ConnectionMetadata>, String> {
    let driver_id =
        crate::application::connections::saved_connection_driver(runtime, connection_id)?;
    let driver = crate::drivers::registry::get_driver(&driver_id)
        .await
        .ok_or_else(|| format!("Unsupported driver: {driver_id}"))?;
    if !driver.has_connection_metadata() {
        return Ok(None);
    }
    let (driver, _params) = driver_and_params(runtime, session_id, connection_id, None).await?;
    Ok(Some(
        crate::plugins::connection_metadata::ConnectionMetadata {
            capabilities: driver.manifest().capabilities.clone(),
            data_types: driver.get_data_types(),
            type_mappings: driver.manifest().type_mappings.clone(),
        },
    ))
}

pub async fn get_ai_schema_context(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    schema: Option<String>,
    database: Option<String>,
) -> Result<String, String> {
    let (driver, params) =
        driver_and_params(runtime, session_id, connection_id, database.clone()).await?;

    let identifier_quote = driver.manifest().capabilities.identifier_quote.as_str();
    let context = driver
        .get_ai_schema_context(
            &params,
            schema.as_deref(),
            crate::ai_schema_context::DEFAULT_MAX_TABLES,
        )
        .await?;
    let mut prompt = crate::ai_schema_context::format_for_prompt(&context, identifier_quote);
    let tables: Vec<String> = context
        .tables
        .iter()
        .map(|table| table.name.clone())
        .collect();
    if let Some(notes) = crate::application::schema_notes::prompt_section(
        runtime.paths.config_dir(),
        connection_id,
        &tables,
        database.as_deref(),
        schema.as_deref(),
    ) {
        if !prompt.is_empty() {
            prompt.push_str("\n\n");
        }
        prompt.push_str(&notes);
    }
    Ok(prompt)
}

pub async fn get_available_databases(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
) -> Result<Vec<String>, String> {
    let (driver, params) = driver_and_params(runtime, session_id, connection_id, None).await?;
    driver.get_databases(&params).await
}

pub async fn get_schemas(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    database: Option<String>,
) -> Result<Vec<String>, String> {
    let (driver, params) = driver_and_params(runtime, session_id, connection_id, database).await?;

    driver.get_schemas(&params).await
}

pub async fn get_tables(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    schema: Option<String>,
    database: Option<String>,
) -> Result<Vec<TableInfo>, String> {
    let (driver, params) = driver_and_params(runtime, session_id, connection_id, database).await?;

    let (tables, sizes) = tokio::join!(
        driver.get_tables(&params, schema.as_deref()),
        table_sizes(driver.as_ref(), &params, schema.as_deref()),
    );
    let mut tables = tables?;
    for table in &mut tables {
        // A size the driver reported itself wins over the host's catalog lookup.
        if table.size_bytes.is_none() {
            table.size_bytes = sizes.get(&table.name).copied();
        }
    }
    Ok(tables)
}

/// Catalog query returning `(table name, total bytes)` rows for one schema, or
/// `None` when the dialect has no cheap bulk size lookup.
fn table_sizes_sql(dialect: SqlDialect, schema: &str) -> Option<String> {
    // shortcut: the schema is inlined as a literal because `execute_query` takes
    // no bind parameters, so names with quotes or backslashes get no sizes;
    // upgrade if drivers gain a parameterised query entry point.
    if schema.is_empty() || schema.contains(['\'', '\\']) {
        return None;
    }
    match dialect {
        // A partitioned parent stores nothing itself, so sum its partitions.
        SqlDialect::Postgres => Some(format!(
            "SELECT c.relname::text, (CASE WHEN c.relkind = 'p' \
             THEN (SELECT COALESCE(SUM(pg_total_relation_size(p.relid)), 0) FROM pg_partition_tree(c.oid) p) \
             ELSE pg_total_relation_size(c.oid) END)::bigint \
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace \
             WHERE n.nspname = '{schema}' AND c.relkind IN ('r', 'p')"
        )),
        SqlDialect::Mysql => Some(format!(
            "SELECT table_name, CAST(data_length + index_length AS SIGNED) \
             FROM information_schema.tables WHERE table_schema = '{schema}'"
        )),
        _ => None,
    }
}

fn parse_table_sizes(rows: &[Vec<Value>]) -> HashMap<String, i64> {
    rows.iter()
        .filter_map(|row| {
            let name = row.first()?.as_str()?;
            let size = row.get(1)?;
            // Some drivers serialise 64-bit integers as strings.
            let size = size.as_i64().or_else(|| size.as_str()?.parse().ok())?;
            Some((name.to_string(), size))
        })
        .collect()
}

/// Table sizes for the explorer. Best effort: any failure yields no sizes.
async fn table_sizes(
    driver: &dyn DatabaseDriver,
    params: &ConnectionParams,
    schema: Option<&str>,
) -> HashMap<String, i64> {
    let Some(dialect) = driver.manifest().capabilities.sql_dialect else {
        return HashMap::new();
    };
    let schema = schema.unwrap_or(match dialect {
        SqlDialect::Postgres => "public",
        _ => params.database.primary(),
    });
    let Some(sql) = table_sizes_sql(dialect, schema) else {
        return HashMap::new();
    };
    // pg_total_relation_size waits on table locks; the table list must not.
    let lookup = driver.execute_query(params, &sql, None, 1, None);
    match tokio::time::timeout(Duration::from_secs(3), lookup).await {
        Ok(Ok(result)) => parse_table_sizes(&result.rows),
        Ok(Err(error)) => {
            log::debug!("Table size lookup failed: {error}");
            HashMap::new()
        }
        Err(_) => {
            log::debug!("Table size lookup timed out");
            HashMap::new()
        }
    }
}

pub async fn get_columns(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    table_name: String,
    schema: Option<String>,
    database: Option<String>,
) -> Result<Vec<TableColumn>, String> {
    let (driver, params) = driver_and_params(runtime, session_id, connection_id, database).await?;

    driver
        .get_columns(&params, &table_name, schema.as_deref())
        .await
}

/// The table's approximate row count from the engine's statistics, or
/// `None` when the driver has none (#709).
pub async fn get_approximate_row_count(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    table_name: String,
    schema: Option<String>,
    database: Option<String>,
) -> Result<Option<u64>, String> {
    let (driver, params) = driver_and_params(runtime, session_id, connection_id, database).await?;

    driver
        .get_approximate_row_count(&params, &table_name, schema.as_deref())
        .await
}

pub async fn get_foreign_keys(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    table_name: String,
    schema: Option<String>,
    database: Option<String>,
) -> Result<Vec<ForeignKey>, String> {
    let (driver, params) = driver_and_params(runtime, session_id, connection_id, database).await?;

    driver
        .get_foreign_keys(&params, &table_name, schema.as_deref())
        .await
}

pub async fn get_indexes(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    table_name: String,
    schema: Option<String>,
    database: Option<String>,
) -> Result<Vec<Index>, String> {
    let (driver, params) = driver_and_params(runtime, session_id, connection_id, database).await?;

    driver
        .get_indexes(&params, &table_name, schema.as_deref())
        .await
}

pub async fn get_views(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    schema: Option<String>,
    database: Option<String>,
) -> Result<Vec<ViewInfo>, String> {
    let (driver, params) = driver_and_params(runtime, session_id, connection_id, database).await?;

    driver.get_views(&params, schema.as_deref()).await
}

pub async fn get_view_columns(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    view_name: String,
    schema: Option<String>,
    database: Option<String>,
) -> Result<Vec<TableColumn>, String> {
    let (driver, params) = driver_and_params(runtime, session_id, connection_id, database).await?;

    driver
        .get_view_columns(&params, &view_name, schema.as_deref())
        .await
}

pub async fn get_materialized_views(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    schema: Option<String>,
    database: Option<String>,
) -> Result<Vec<ViewInfo>, String> {
    let (driver, params) = driver_and_params(runtime, session_id, connection_id, database).await?;

    driver
        .get_materialized_views(&params, schema.as_deref())
        .await
}

pub async fn get_materialized_view_columns(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    view_name: String,
    schema: Option<String>,
    database: Option<String>,
) -> Result<Vec<TableColumn>, String> {
    let (driver, params) = driver_and_params(runtime, session_id, connection_id, database).await?;

    driver
        .get_materialized_view_columns(&params, &view_name, schema.as_deref())
        .await
}

pub async fn get_materialized_view_definition(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    view_name: String,
    schema: Option<String>,
    database: Option<String>,
) -> Result<String, String> {
    let (driver, params) = driver_and_params(runtime, session_id, connection_id, database).await?;

    driver
        .get_materialized_view_definition(&params, &view_name, schema.as_deref())
        .await
}

pub async fn get_routines(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    schema: Option<String>,
    database: Option<String>,
) -> Result<Vec<RoutineInfo>, String> {
    let (driver, params) = driver_and_params(runtime, session_id, connection_id, database).await?;

    driver.get_routines(&params, schema.as_deref()).await
}

pub async fn get_triggers(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    schema: Option<String>,
    database: Option<String>,
) -> Result<Vec<TriggerInfo>, String> {
    let (driver, params) = driver_and_params(runtime, session_id, connection_id, database).await?;

    driver.get_triggers(&params, schema.as_deref()).await
}

pub async fn get_schema_snapshot(
    runtime: &RuntimeContext,
    session_id: Option<Uuid>,
    connection_id: &str,
    schema: Option<String>,
    database: Option<String>,
) -> Result<Vec<TableSchema>, String> {
    let (driver, params) = driver_and_params(runtime, session_id, connection_id, database).await?;

    driver.get_schema_snapshot(&params, schema.as_deref()).await
}

pub fn get_selected_schemas(
    runtime: &RuntimeContext,
    connection_id: &str,
    database: Option<String>,
) -> Vec<String> {
    load_config(runtime)
        .selected_schemas
        .and_then(|schemas| {
            schemas
                .get(&crate::config::schema_storage_key(
                    connection_id,
                    database.as_deref(),
                ))
                .cloned()
        })
        .unwrap_or_default()
}

pub fn set_selected_schemas(
    runtime: &RuntimeContext,
    connection_id: String,
    schemas: Vec<String>,
    database: Option<String>,
) -> Result<(), String> {
    crate::application::persistence::set_selected_schemas(
        runtime,
        crate::config::schema_storage_key(&connection_id, database.as_deref()),
        schemas,
    )
}

pub fn get_schema_preference(
    runtime: &RuntimeContext,
    connection_id: &str,
    database: Option<String>,
) -> Option<String> {
    load_config(runtime)
        .schema_preferences
        .and_then(|preferences| {
            crate::config::resolve_schema_preference(
                &preferences,
                connection_id,
                database.as_deref(),
            )
        })
}

pub fn set_schema_preference(
    runtime: &RuntimeContext,
    connection_id: String,
    schema: String,
    database: Option<String>,
) -> Result<(), String> {
    crate::application::persistence::set_schema_preference(
        runtime,
        crate::config::schema_storage_key(&connection_id, database.as_deref()),
        schema,
    )
}

fn load_config(runtime: &RuntimeContext) -> crate::config::AppConfig {
    crate::application::persistence::load_config(runtime)
}

fn json(value: impl Serialize) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|error| error.to_string())
}

#[cfg(test)]
#[path = "metadata_tests.rs"]
mod tests;
