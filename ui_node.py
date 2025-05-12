class UINode:
    @classmethod
    def INPUT_TYPES(cls):
        return {}
    RETURN_TYPES = ()
    FUNCTION = "return_empty"
    CATEGORY = "EasyUI"

    def __init__(self):
        self.original_node_id = None
        self.original_node_type = None

    def return_empty(self):
        return ()