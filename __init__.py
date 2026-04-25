"""
Node Invaders - ComfyUI Arcade Shooter
"""

WEB_DIRECTORY = "."


class NodeInvaders_Game:
    """Node Invaders Game node - loads the game overlay in ComfyUI."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "run"
    OUTPUT_NODE = True
    CATEGORY = "Game"

    def run(self):
        return ()


NODE_CLASS_MAPPINGS = {
    "NodeInvaders_Game": NodeInvaders_Game
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NodeInvaders_Game": "Node Invaders"
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
