from .ui_node import UINode

__version__ = "1.0.0"

NODE_CLASS_MAPPINGS = {
    "UINode": UINode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "UINode": "UINode [GroxicTinch]",
}

WEB_DIRECTORY = "./web/comfyui"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]