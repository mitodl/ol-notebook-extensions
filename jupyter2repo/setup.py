__import__("setuptools").setup()
import json
import os
from jupyter_core.paths import jupyter_config_dir

PLUGIN_ID = "jupyter2repo"
config_dir = jupyter_config_dir()
settings_path = os.path.join(config_dir, "lab", "user-settings", PLUGIN_ID, "plugin.json")
os.makedirs(os.path.dirname(settings_path), exist_ok=True)

settings_data = {
    "GH_APP_ID": os.environ.get("GH_APP_ID"),
    "GH_APP_URL": os.environ.get("GH_APP_URL"),
}
with open(settings_path, "w") as f:
    json.dump(settings_data, f, indent=2)