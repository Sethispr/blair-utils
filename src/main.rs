use anyhow::Result;
use config::{Config, File, FileFormat};
use indexmap::IndexSet;
use indicatif::{ProgressBar, ProgressStyle};
use oxipng::{optimize, Deflaters, InFile, Options, OutFile, RowFilter};
use rayon::prelude::*;
use serde::Deserialize;
use std::fs;
use std::num::NonZeroU8;
use std::path::{Path, PathBuf};
use std::time::Instant;

// config structs
#[derive(Debug, Deserialize)]
struct CompressionConfig {
    level: u8,
    max_workers: Option<usize>,
    strip_metadata: bool,
    optimize_alpha: bool,
    fast_evaluation: bool,
}

#[derive(Debug, Deserialize)]
struct LoggingConfig {
    show_progress: bool,
    show_file_sizes: bool,
    show_summary: bool,
    verbose_logging: bool,
}

#[derive(Debug, Deserialize)]
struct AdvancedConfig {
    custom_filters: Vec<String>,
    deflate_method: String,
    deflate_level: u8,
    interlace: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BlairConfig {
    compression: CompressionConfig,
    logging: LoggingConfig,
    advanced: AdvancedConfig,
}

impl Default for BlairConfig {
    fn default() -> Self {
        Self {
            compression: CompressionConfig {
                level: 6,
                max_workers: None,
                strip_metadata: true,
                optimize_alpha: false,
                fast_evaluation: false,
            },
            logging: LoggingConfig {
                show_progress: true,
                show_file_sizes: true,
                show_summary: true,
                verbose_logging: false,
            },
            advanced: AdvancedConfig {
                custom_filters: vec![
                    "None".to_string(),
                    "Sub".to_string(),
                    "Up".to_string(),
                    "Average".to_string(),
                    "Paeth".to_string(),
                ],
                deflate_method: "libdeflate".to_string(),
                deflate_level: 12,
                interlace: None,
            },
        }
    }
}

// simple logger with emojis
struct BlairLogger;

impl BlairLogger {
    fn success(message: &str) {
        println!("✅ {}", message);
    }

    fn warning(message: &str) {
        println!("⚠️ {}", message);
    }

    fn error(message: &str) {
        println!("❌ {}", message);
    }

    fn bot(message: &str) {
        println!("🤖 {}", message);
    }
}

// track file optimization results
struct FileStats {
    original_size: u64,
    new_size: u64,
    success: bool,
}

impl FileStats {
    fn savings(&self) -> i64 {
        self.original_size as i64 - self.new_size as i64
    }
}

// cache for filter mappings
struct OptimizationCache {
    filter_mapping: Vec<(&'static str, RowFilter)>,
}

impl OptimizationCache {
    fn new() -> Self {
        Self {
            filter_mapping: vec![
                ("None", RowFilter::None),
                ("Sub", RowFilter::Sub),
                ("Up", RowFilter::Up),
                ("Average", RowFilter::Average),
                ("Paeth", RowFilter::Paeth),
                ("MinSum", RowFilter::MinSum),
                ("Entropy", RowFilter::Entropy),
                ("Bigrams", RowFilter::Bigrams),
                ("BigEnt", RowFilter::BigEnt),
                ("Brute", RowFilter::Brute),
            ],
        }
    }
}

// load config from file or use defaults
fn load_config() -> Result<BlairConfig> {
    let config_path = "blair.toml";

    if Path::new(config_path).exists() {
        let settings = Config::builder()
            .add_source(File::with_name(config_path).format(FileFormat::Toml))
            .build()?;

        let config: BlairConfig = settings.try_deserialize()?;
        BlairLogger::bot("Loaded config from blair.toml");
        Ok(config)
    } else {
        BlairLogger::bot("Using default config");
        BlairLogger::bot("Create blair.toml to customize settings");
        Ok(BlairConfig::default())
    }
}

// format file sizes for display
fn bytes_to_mb(bytes: u64) -> f64 {
    bytes as f64 / (1024.0 * 1024.0)
}

fn format_file_size(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;

    if bytes < KB as u64 {
        format!("{} B", bytes)
    } else if bytes < MB as u64 {
        format!("{:.1} KB", bytes as f64 / KB)
    } else if bytes < GB as u64 {
        format!("{:.1} MB", bytes as f64 / MB)
    } else {
        format!("{:.1} GB", bytes as f64 / GB)
    }
}

// format time for display
fn format_time(seconds: f64) -> String {
    const MINUTE: f64 = 60.0;
    const HOUR: f64 = 3600.0;

    if seconds < MINUTE {
        format!("{:.1}s", seconds)
    } else if seconds < HOUR {
        format!("{:.1}m", seconds / MINUTE)
    } else {
        format!("{:.1}h", seconds / HOUR)
    }
}

// create oxipng options from config
fn create_optimization_options(config: &BlairConfig, cache: &OptimizationCache) -> Options {
    let filters: IndexSet<RowFilter> = config
        .advanced
        .custom_filters
        .iter()
        .filter_map(|filter_name| {
            cache
                .filter_mapping
                .iter()
                .find(|(name, _)| *name == filter_name)
                .map(|(_, filter)| *filter)
        })
        .collect();

    let mut options = Options::from_preset(config.compression.level);

    options.strip = if config.compression.strip_metadata {
        oxipng::StripChunks::Safe
    } else {
        oxipng::StripChunks::None
    };

    options.optimize_alpha = config.compression.optimize_alpha;
    options.fast_evaluation = config.compression.fast_evaluation;
    options.filter = filters;

    // set deflate method
    options.deflate = if config.advanced.deflate_method == "zopfli" {
        Deflaters::Zopfli {
            iterations: NonZeroU8::new(config.advanced.deflate_level)
                .unwrap_or_else(|| NonZeroU8::new(1).unwrap()),
        }
    } else {
        Deflaters::Libdeflater { compression: config.advanced.deflate_level }
    };

    // set interlacing if specified
    if let Some(interlace) = &config.advanced.interlace {
        options.interlace = match interlace.as_str() {
            "Adam7" => Some(oxipng::Interlacing::Adam7),
            "None" => Some(oxipng::Interlacing::None),
            _ => None,
        };
    }

    options
}

// optimize a single png file
fn optimize_single_png(
    file_path: &Path,
    options: &Options,
    verbose_logging: bool,
) -> Result<FileStats> {
    let original_size = fs::metadata(file_path)?.len();

    let in_file = InFile::Path(file_path.to_path_buf());
    let out_file = OutFile::from_path(file_path.to_path_buf());

    match optimize(&in_file, &out_file, options) {
        Ok(_) => {
            let new_size = fs::metadata(file_path)?.len();

            if verbose_logging {
                let filename = file_path.file_name().unwrap().to_string_lossy();
                let savings = original_size as i64 - new_size as i64;
                let percent = (savings as f64 / original_size as f64) * 100.0;

                match savings.cmp(&0) {
                    std::cmp::Ordering::Greater => {
                        BlairLogger::success(&format!(
                            "{} - reduced by {:.1}% ({} bytes)",
                            filename, percent, savings
                        ));
                    },
                    std::cmp::Ordering::Equal => {
                        println!("{} - no size change", filename);
                    },
                    std::cmp::Ordering::Less => {
                        BlairLogger::warning(&format!(
                            "{} - increased by {:.1}% ({} bytes)",
                            filename, -percent, -savings
                        ));
                    },
                }
            }

            Ok(FileStats { original_size, new_size, success: true })
        },
        Err(e) => {
            if verbose_logging {
                let filename = file_path.file_name().unwrap().to_string_lossy();
                BlairLogger::error(&format!("{}: {}", filename, e));
            }
            Ok(FileStats { original_size, new_size: original_size, success: false })
        },
    }
}

// find all png files in directory
fn find_png_files(dir_path: &Path) -> Result<Vec<PathBuf>> {
    let mut png_files = Vec::new();

    if let Ok(entries) = fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext.eq_ignore_ascii_case("png")) {
                png_files.push(path);
            }
        }
    }

    Ok(png_files)
}

// create progress bar if enabled
fn create_progress_bar(file_count: usize, show_progress: bool) -> Option<ProgressBar> {
    if !show_progress {
        return None;
    }

    let pb = ProgressBar::new(file_count as u64);
    if let Ok(style) = ProgressStyle::default_bar()
        .template("🖼️ Compressing PNG's {bar:40.cyan/blue} {pos}/{len} | {msg}")
        .map(|s| s.progress_chars("██▒"))
    {
        pb.set_style(style);
    }
    Some(pb)
}

// main optimization function
fn batch_compress_png_parallel(directory: &str, config: &BlairConfig) -> Result<()> {
    let dir_path = Path::new(directory);
    if !dir_path.exists() {
        BlairLogger::error(&format!("Directory not found: {}", directory));
        return Ok(());
    }

    let png_files = find_png_files(dir_path)?;
    let file_count = png_files.len();

    if file_count == 0 {
        BlairLogger::warning(&format!("No png files found in {}", directory));
        return Ok(());
    }

    BlairLogger::bot(&format!("Found {} png files", file_count));

    // setup parallel processing
    let max_workers = config
        .compression
        .max_workers
        .unwrap_or_else(|| std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1));

    rayon::ThreadPoolBuilder::new().num_threads(max_workers).build_global().unwrap_or_default();

    BlairLogger::bot(&format!("Starting optimization with {} workers", max_workers));

    let start_time = Instant::now();

    // calculate total size before optimization
    let total_original_size: u64 =
        png_files.par_iter().map(|path| fs::metadata(path).map(|m| m.len()).unwrap_or(0)).sum();

    let cache = OptimizationCache::new();
    let options = create_optimization_options(config, &cache);
    let verbose_logging = config.logging.verbose_logging;

    let progress_bar = create_progress_bar(file_count, config.logging.show_progress);

    // process files in parallel
    let results: Vec<FileStats> = png_files
        .par_iter()
        .with_min_len(1.max(file_count / (max_workers * 4)))
        .with_max_len(1.max(file_count / max_workers))
        .map(|file_path| {
            let result = optimize_single_png(file_path, &options, verbose_logging);

            if let Some(pb) = &progress_bar {
                pb.inc(1);
            }

            result.unwrap_or(FileStats { original_size: 0, new_size: 0, success: false })
        })
        .collect();

    if let Some(pb) = progress_bar {
        pb.finish_with_message("✅ Optimization complete!");
    }

    let processing_time = start_time.elapsed().as_secs_f64();

    // process results
    let (successful, no_change, increased): (usize, usize, usize) = results
        .par_iter()
        .fold(
            || (0, 0, 0),
            |(suc, no_inc, inc), r| {
                if r.success {
                    if r.savings() > 0 {
                        (suc + 1, no_inc, inc)
                    } else {
                        (suc, no_inc + 1, inc)
                    }
                } else {
                    (suc, no_inc, inc + 1)
                }
            },
        )
        .reduce(|| (0, 0, 0), |a, b| (a.0 + b.0, a.1 + b.1, a.2 + b.2));

    let total_savings: i64 = results.par_iter().map(|r| r.savings()).sum();
    let total_new_size = total_original_size as i64 - total_savings;
    let total_savings_percent = if total_original_size > 0 {
        (total_savings as f64 / total_original_size as f64) * 100.0
    } else {
        0.0
    };

    // show summary
    if config.logging.show_summary {
        println!("==================================================");
        BlairLogger::success(&format!("Completed in {}", format_time(processing_time)));
        println!("📊 Processed: {} files", file_count);
        println!("📈 Results: {}✅ {}➖ {}📈", successful, no_change, increased);
        println!(
            "💾 Reduction: {:.1}% ({:.2} MB saved)",
            total_savings_percent,
            bytes_to_mb(total_savings as u64)
        );

        if config.logging.show_file_sizes {
            println!(
                "📦 Final size: {} (was {})",
                format_file_size(total_new_size as u64),
                format_file_size(total_original_size)
            );
        }

        let files_per_second = file_count as f64 / processing_time;
        println!("⚡ Speed: {:.1} files/sec", files_per_second);
        println!("==================================================");
    }

    Ok(())
}

// show current config
fn show_config_summary(config: &BlairConfig) {
    let workers = config
        .compression
        .max_workers
        .unwrap_or_else(|| std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1));

    BlairLogger::bot("Current config:");
    println!("   • compression level: {}", config.compression.level);
    println!("   • max workers: {}", workers);
    println!("   • strip metadata: {}", config.compression.strip_metadata);
    println!("   • deflate method: {}", config.advanced.deflate_method);
    println!("   • show progress: {}", config.logging.show_progress);
}

fn main() -> Result<()> {
    BlairLogger::bot("Starting oxipng..");

    let config = load_config()?;
    show_config_summary(&config);
    println!();

    let directory = r"D:\blair\blairBlender\cards";
    batch_compress_png_parallel(directory, &config)?;

    BlairLogger::success("All operations completed!");
    Ok(())
}
