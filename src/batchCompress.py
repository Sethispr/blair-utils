import concurrent.futures
import configparser
import glob
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path

from tqdm import tqdm

try:
    import oxipng
    OXIPNG_AVAILABLE = True
except ImportError:
    OXIPNG_AVAILABLE = False

logging.basicConfig(
    level=logging.INFO, 
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

class BlairLogger:
    """Beautiful logging with emojis and colors in your style."""
    
    @staticmethod
    def log(message, style="info", emoji="✨"):
        """Main logging method with styling."""
        print(f"{emoji} {message}")
    
    @classmethod
    def success(cls, message):
        cls.log(message, "success", "✅")
    
    @classmethod 
    def info(cls, message):
        cls.log(message, "info", "ℹ️")
    
    @classmethod
    def warning(cls, message):
        cls.log(message, "warning", "⚠️")
    
    @classmethod
    def error(cls, message):
        cls.log(message, "error", "❌")
    
    @classmethod
    def bot(cls, message):
        cls.log(message, "bot", "🤖")
    
    @classmethod
    def cog(cls, cog_name):
        """VIBRANT multi-color cog logging"""
        print(f"⚙️  Loaded {cog_name}")
    
    @classmethod
    def colorful_ready(cls, user_info):
        """Multi-color for ready message"""
        print(f"✅ Logged in as {user_info}")
    
    @classmethod
    def colorful_sync(cls, count, scope="globally"):
        """Multi-color for sync messages"""
        print(f"✅ Synced {count} slash commands {scope}")
    
    @classmethod
    def sync_progress(cls, message):
        """Special style for sync progress"""
        cls.log(message, "info", "🔄")

class BlairConfig:
    """Hackable configuration system using .blair.config"""
    
    def __init__(self, config_path=".blair.config"):
        self.config_path = Path(config_path)
        self.config = configparser.ConfigParser()
        self.load_defaults()
        self.load_config()
    
    def load_defaults(self):
        """Set default configuration values"""
        self.defaults = {
            'compression': {
                'level': '6',
                'max_workers': 'auto',
                'strip_metadata': 'true',
                'preserve_transparency': 'true',
                'optimize_alpha': 'false',
                'fast_evaluation': 'false',
                'timeout': '0',
            },
            'logging': {
                'show_progress': 'true',
                'show_file_sizes': 'true',
                'show_summary': 'true',
                'emoji_style': 'true',
                'show_tqdm': 'true',
                'verbose_logging': 'false',
            },
            'advanced': {
                'custom_filters': 'NoOp,Sub,Up,Average,Paeth',
                'deflate_method': 'libdeflate',
                'deflate_level': '12',
                'interlace': 'None',
            }
        }
    
    def load_config(self):
        """Load configuration from file or create with defaults"""
        if self.config_path.exists():
            self.config.read(self.config_path)
            BlairLogger.info(f"📁 Loaded config from {self.config_path}")
        else:
            self.create_default_config()
    
    def create_default_config(self):
        """Create default configuration file"""
        self.config.read_dict(self.defaults)
        with open(self.config_path, 'w') as f:
            self.config.write(f)
        BlairLogger.info(f"📝 Created default config at {self.config_path}")
    
    def get(self, section, key, fallback=None):
        """Get config value with fallback"""
        try:
            return self.config.get(section, key)
        except (configparser.NoSectionError, configparser.NoOptionError):
            return fallback if fallback is not None else self.defaults.get(section, {}).get(key)
    
    def getint(self, section, key, fallback=None):
        """Get config value as integer"""
        try:
            return self.config.getint(section, key)
        except (configparser.NoSectionError, configparser.NoOptionError, ValueError):
            return fallback if fallback is not None else int(self.defaults.get(section, {}).get(key, 0))
    
    def getboolean(self, section, key, fallback=None):
        """Get config value as boolean"""
        try:
            return self.config.getboolean(section, key)
        except (configparser.NoSectionError, configparser.NoOptionError, ValueError):
            return fallback if fallback is not None else self.defaults.get(section, {}).get(key, 'false').lower() == 'true'

# Initialize config
config = BlairConfig()

def optimize_with_oxipng(png_file):
    """Main optimization with oxipng using config settings"""
    if not OXIPNG_AVAILABLE:
        BlairLogger.error("oxipng is not available")
        return False
    
    try:
        # Parse filters from config
        filter_names = [f.strip() for f in config.get('advanced', 'custom_filters').split(',')]
        filters = []
        for filter_name in filter_names:
            if hasattr(oxipng.RowFilter, filter_name):
                filters.append(getattr(oxipng.RowFilter, filter_name))
        
        if not filters:
            filters = [oxipng.RowFilter.NoOp]  # Default fallback
        
        # Parse interlace from config
        interlace = None
        interlace_config = config.get('advanced', 'interlace')
        if interlace_config != 'None' and hasattr(oxipng.Interlacing, interlace_config):
            interlace = getattr(oxipng.Interlacing, interlace_config)
        
        # Parse deflate method from config
        deflate_method = config.get('advanced', 'deflate_method')
        if deflate_method == 'zopfli':
            deflate = oxipng.Deflaters.zopfli(config.getint('advanced', 'deflate_level'))
        else:  # libdeflate default
            deflate = oxipng.Deflaters.libdeflater(config.getint('advanced', 'deflate_level'))
        
        oxipng.optimize(
            png_file,
            level=config.getint('compression', 'level'),
            fix_errors=True,
            force=False,  # Only write if compression improves
            filter=filters,
            interlace=interlace,
            optimize_alpha=config.getboolean('compression', 'optimize_alpha'),
            bit_depth_reduction=False,
            color_type_reduction=False,
            palette_reduction=False,
            grayscale_reduction=False,
            idat_recoding=True,
            scale_16=False,
            strip=oxipng.StripChunks.safe() if config.getboolean('compression', 'strip_metadata') else oxipng.StripChunks.none(),
            deflate=deflate,
            fast_evaluation=config.getboolean('compression', 'fast_evaluation'),
            timeout=config.getint('compression', 'timeout') or None,
        )
        
        if config.getboolean('logging', 'verbose_logging'):
            BlairLogger.success(f"Optimized: {os.path.basename(png_file)}")
        return True
        
    except Exception as e:
        if config.getboolean('logging', 'verbose_logging'):
            BlairLogger.error(f"Failed for {os.path.basename(png_file)}: {str(e)}")
        return False

def get_file_size(file_path):
    """Get file size in bytes"""
    return os.path.getsize(file_path)

def bytes_to_mb(bytes_size):
    """Convert bytes to megabytes"""
    return bytes_size / (1024 * 1024)

def format_file_size(bytes_size):
    """Format file size in human readable format"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.1f} TB"

def format_time(seconds):
    """Format time in human readable format"""
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        minutes = seconds / 60
        return f"{minutes:.1f}m"
    else:
        hours = seconds / 3600
        return f"{hours:.1f}h"

def optimize_single_png(png_file):
    """Optimize a single PNG file using ONLY oxipng"""
    original_size = get_file_size(png_file)
    
    try:
        success = optimize_with_oxipng(png_file)
        
        if not success:
            return False, 0
        
        new_size = get_file_size(png_file)
        savings = original_size - new_size
        
        return savings >= 0, savings  # Return success status and savings amount
        
    except Exception as e:
        return False, 0

def batch_compress_png_parallel(directory):
    """Batch compress all PNG files using parallel processing with oxipng only"""
    png_files = glob.glob(os.path.join(directory, "*.png"))
    
    if not png_files:
        BlairLogger.warning(f"No PNG files found in {directory}")
        return

    if not OXIPNG_AVAILABLE:
        BlairLogger.error("CRITICAL: oxipng is not available. Cannot proceed with optimization.")
        return

    # Determine max workers
    max_workers_config = config.get('compression', 'max_workers')
    if max_workers_config.lower() == 'auto':
        max_workers = os.cpu_count()
    else:
        max_workers = min(int(max_workers_config), len(png_files))
    
    BlairLogger.info(f"🔍 Found {len(png_files)} PNG files")
    BlairLogger.info(f"⚙️  Starting optimization with {max_workers} workers...")
    
    start_time = time.time()
    total_original_size = sum(get_file_size(f) for f in png_files)

    if config.getboolean('logging', 'show_tqdm'):
        successful = 0
        no_change = 0
        increased = 0
        failed = 0
        total_savings = 0
        total_savings_mb = 0
        
        with tqdm(
            total=len(png_files),
            desc="🖼️  Compressing PNGs",
            unit="file",
            ncols=100,
            bar_format="{l_bar}{bar:40}| {n_fmt}/{total_fmt} | {postfix}",
            postfix="Starting...",
            leave=True
        ) as progress_bar:
            
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                # Submit all tasks
                future_to_file = {
                    executor.submit(optimize_single_png, file): file 
                    for file in png_files
                }
                
                # Process completed tasks and update progress
                for future in concurrent.futures.as_completed(future_to_file):
                    try:
                        success, savings = future.result()
                        total_savings += savings
                        total_savings_mb = bytes_to_mb(total_savings)
                        
                        if success and savings > 0:
                            successful += 1
                        elif success and savings == 0:
                            no_change += 1
                        elif not success:
                            increased += 1
                    except Exception:
                        failed += 1
                    
                    # Update progress bar
                    progress_bar.update(1)
                    stats_text = f"📊 {successful}✅ {no_change}➖ {increased}📈 {failed}❌ | 💾 {total_savings_mb:.2f}MB saved"
                    progress_bar.set_postfix_str(stats_text, refresh=True)
            
    else:
        # Fallback to non-tqdm version
        successful = 0
        no_change = 0
        increased = 0
        failed = 0
        total_savings = 0
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(optimize_single_png, file): file 
                for file in png_files
            }
            
            for future in concurrent.futures.as_completed(futures):
                try:
                    success, savings = future.result()
                    total_savings += savings
                    if success and savings > 0:
                        successful += 1
                    elif success and savings == 0:
                        no_change += 1
                    elif not success:
                        increased += 1
                except Exception as e:
                    failed += 1

    # Calculate final statistics
    end_time = time.time()
    processing_time = end_time - start_time
    total_new_size = total_original_size - total_savings
    total_savings_percent = (total_savings / total_original_size) * 100 if total_original_size > 0 else 0
    total_savings_mb = bytes_to_mb(total_savings)

    if config.getboolean('logging', 'show_summary'):
        print()
        BlairLogger.info("=" * 60)
        BlairLogger.info(f"🎉 OPTIMIZATION COMPLETED in {format_time(processing_time)}")
        BlairLogger.info(f"📊 Files processed: {len(png_files)}")
        BlairLogger.info(f"📈 Results: {successful}✅ {no_change}➖ {increased}📈 {failed}❌")
        BlairLogger.info(f"💾 Total savings: {total_savings_percent:.1f}% ({total_savings_mb:.2f} MB)")
        
        if config.getboolean('logging', 'show_file_sizes'):
            original_mb = bytes_to_mb(total_original_size)
            new_mb = bytes_to_mb(total_new_size)
            BlairLogger.info(f"📦 Final size: {format_file_size(total_new_size)} (was {format_file_size(total_original_size)})")
            BlairLogger.info(f"📐 Size change: {new_mb:.2f} MB → {original_mb:.2f} MB")
        
        files_per_second = len(png_files) / processing_time if processing_time > 0 else 0
        BlairLogger.info(f"⚡ Processing speed: {files_per_second:.1f} files/sec")
        
        BlairLogger.info("=" * 60)

def show_config_summary():
    """Show current configuration summary"""
    BlairLogger.info("⚙️  Current Configuration:")
    BlairLogger.info(f"   • Compression Level: {config.get('compression', 'level')}")
    BlairLogger.info(f"   • Max Workers: {config.get('compression', 'max_workers')}")
    BlairLogger.info(f"   • Deflate Method: {config.get('advanced', 'deflate_method')}")
    BlairLogger.info(f"   • Show Progress: {config.get('logging', 'show_tqdm')}")
    BlairLogger.info("💡 Edit .blair.config to customize settings")

if __name__ == "__main__":
    directory = r"D:\blair\blairBlender\cards" # SET DIRECTORY HERE
    
    # Show config summary
    show_config_summary()
    print()
    batch_compress_png_parallel(directory)
