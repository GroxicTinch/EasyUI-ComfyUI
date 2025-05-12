import { app } from "../../scripts/app.js";

// [FIXME] Delete the UINode if the original node is deleted
// [TODO] Add a way to get taken to the original node from the UINode

var ignoredWidgets = ['button'];

/** ─────────────────────────────────────────────────────────────────────
 * 1) Extract your two bits of logic into named functions.
 *    These will live in module scope so both the commands and the
 *    context-menu callbacks can refer to them.
 * ───────────────────────────────────────────────────────────────────── */
function createMirror(node) {
    if (!node) return;
    const graph  = node.graph ?? app.canvas.graph;
    const uiNode = LiteGraph.createNode("UINode");
    graph.add(uiNode);

    uiNode.properties = uiNode.properties || {};
    uiNode.properties.original_node_id = node.id;
  
    // position & clear I/O
    uiNode.pos     = [node.pos[0] + 50, node.pos[1] + 50];
    uiNode.inputs  = [];
    uiNode.outputs = [];
  
    // 1) redraw immediately so the DOM is created
    app.canvas.setDirty(true);
    app.canvas.draw(true);

    // [FIXME] elements arent working (preview image, customtext)
  
    // // 2) find the newly-rendered node element
    // uiNode.element = node.element;
  
    // 3) pass that nodeEl into cloneWidgets
    cloneWidgets(node, uiNode);
  }

/** ─────────────────────────────────────────────────────────────────────
 * 2) Register a single extension that
 *    a) declares both commands (so invokeExtensionCommand() can find them)
 *    b) monkey-patches getExtraMenuOptions to call them in the right-click menu
 * ───────────────────────────────────────────────────────────────────── */
app.registerExtension({
  name: 'easyui',  // just one extension now

  beforeRegisterNodeDef(nodeTypeInfo) {
    const proto     = nodeTypeInfo.prototype;
    const original  = proto.getExtraMenuOptions;

    proto.getExtraMenuOptions = function(_, options = []) {
      // 1) keep all built-ins
        if (original) {
            original.apply(this, arguments);
        }

        options.push(null); // inserts a divider
        // 2) if it's a UINode, Don't add “Create Mirror Copy”
        if (this.type !== 'UINode') {
            options.push({
                content: '🖼️ EasyUI – Create Mirror Copy',
                callback: () => createMirror(this)
            });
        }

        // 3) if it’s a UINode, also add “Toggle Widget Visibility”
        if (this.type === 'UINode') {
            options.push({
                content: '🖼️ EasyUI – Toggle Widget Visibility',
                has_submenu: true,
                callback: make_submenu
            });
        }
        options.push(null); // inserts a divider

      return options;
    };

    // Add configure override for UINode to restore widgets on load
    if (nodeTypeInfo.comfyClass === 'UINode') {
        const originalConfigure = proto.configure;
        proto.configure = function(serializedNode) {
            // Call the original configure method first
            if (originalConfigure) {
                originalConfigure.apply(this, arguments);
            }
            // Clone widgets from the original node
            const originalNodeId = this.properties.original_node_id;
            if (originalNodeId) {
                const originalNode = app.canvas.graph.getNodeById(originalNodeId);
                if (originalNode) {
                    cloneWidgets(originalNode, this);
                } else {
                    console.warn(`Original node with ID ${originalNodeId} not found.`);
                }
            }
        };
    }
  }
});

function make_submenu(value, options, e, menu, node) {
    var subOptionsDisabled = [];
    var subOptionsEnabled = [];

    const originalNodeId = node.properties.original_node_id;
    if (originalNodeId) {
        const originalNode = app.canvas.graph.getNodeById(originalNodeId);
        if (originalNode) {
            // Loop through the widgets and create sub-options
            originalNode.widgets.forEach(widget => {
                const isHidden = node.properties.hiddenWidgets.includes(widget.name);
                if (isHidden) {
                    if(!widget.computedDisabled && !ignoredWidgets.includes(type)) {
                        subOptionsDisabled.push(`Enable ${widget.name}`);
                    }
                } else {
                    subOptionsEnabled.push(`Disable ${widget.name}`);
                }
            });
        } else {
            console.warn(`Original node with ID ${originalNodeId} not found.`);
        }
    }

    if(subOptionsDisabled.length > 0) {
        subOptionsDisabled.push(null); // inserts a divider
    }

    var subOptions = subOptionsDisabled.concat(subOptionsEnabled);

    if (subOptions.length === 0) {
        subOptions.push("No widgets to toggle");
    }

    const submenu = new LiteGraph.ContextMenu(
        subOptions,
        { 
            event: e, 
            callback: function (v) { 
                if (v === "No widgets to toggle") {
                    return;
                }
                if (v.startsWith("Disable")) {
                    const widgetName = v.replace("Disable ", "");
                    node.properties.hiddenWidgets.push(widgetName);
                } else if (v.startsWith("Enable")) {
                    const widgetName = v.replace("Enable ", "");
                    node.properties.hiddenWidgets = node.properties.hiddenWidgets.filter(name => name !== widgetName);
                }

                const originalNode = app.canvas.graph.getNodeById(node.properties.original_node_id);
                if (originalNode) {
                    cloneWidgets(originalNode, node);
                    app.canvas.setDirty(true);
                    app.canvas.draw(true);
                }
            }, 
            parentMenu: menu, 
            node:node
        }
    )
}

/** ─────────────────────────────────────────────────────────────────────
 * 3) Keep your widget-cloning helper unchanged
 * ───────────────────────────────────────────────────────────────────── */
function cloneWidgets(originalNode, uiNode) {
    uiNode.widgets = [];
    uiNode.widgets_values = [];
    uiNode.properties.hiddenWidgets = uiNode.properties.hiddenWidgets || [];

    originalNode.widgets.forEach(origW => {
        const type = origW.type || 'string';
        const options = origW.options || {};
        try {
            // Example: Mark some widgets to be hidden initially
            const isHidden = uiNode.properties.hiddenWidgets.includes(origW.name);
            if (origW.computedDisabled || isHidden || ignoredWidgets.includes(type)) {
                if (!isHidden) {
                    uiNode.properties.hiddenWidgets.push(origW.name);
                }
                return;
            }
            
            const oldCallback = origW.callback;

            const newW = uiNode.addWidget(
                type,
                origW.name,
                origW.value,
                function(...args) {
                    const v = args[0];
                    origW.value = v;
                    if (typeof oldCallback === 'function') {
                        oldCallback.call(origW, ...args);
                    }
                    app.canvas.setDirty(true);
                },
                options
            );

            origW.callback = function(...args) {
                const v = args[0];
                if (typeof oldCallback === 'function') {
                    oldCallback.call(this, ...args);
                }
                newW.value = v;
                app.canvas.setDirty(true);
            };
        } catch (err) {
            console.warn('Skipping unsupported widget:', origW, err);
        }
    });
}