import { app } from "../../scripts/app.js";

// [FIXME] Delete the UINode if the original node is deleted
// [FIXME] Order of widgets doesnt persist properly when refreshing page
// [FIXME] elements arent working (preview image, customtext)
// [FIXME] adding multiple mirrors will cause callback restoring to break
// [TODO] Add a way to get taken to the original node from the UINode
// [TODO] Combine many nodes into one UINode

var ignoredWidgets = ['button'];

function createMirror(node) {
    if (!node) return;
    const graph  = node.graph ?? app.canvas.graph;
    const uiNode = LiteGraph.createNode("UINode");
    graph.add(uiNode);

    uiNode.properties = uiNode.properties || {};
    uiNode.properties.original_node_id = node.id;
    uiNode.properties.widgetOrder = [];
    uiNode.serialize_widgets = false;

    uiNode.title = '🖼️ ' + node.title;

    // position & clear I/O
    uiNode.pos = [node.pos[0] + 50, node.pos[1] + 50];
    uiNode.inputs = [];
    uiNode.outputs = [];

    app.canvas.setDirty(true);
    app.canvas.draw(true);

    cloneWidgets(node, uiNode);
}

app.registerExtension({
  name: 'easyui',

  beforeRegisterNodeDef(nodeTypeInfo) {
    const proto = nodeTypeInfo.prototype;
    const original  = proto.getExtraMenuOptions;  

    // hide the UINode from the node list
    if (nodeTypeInfo.comfyClass === 'UINode') {
        nodeTypeInfo.skip_list = true;
    }

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
            options.push({
                content: '🖼️ EasyUI [DEBUG]',
                callback: () => {
                    console.log(this);
                }
            });
        }

        // 3) if it’s a UINode, also add “Toggle Widget Visibility”
        if (this.type === 'UINode') {
            options.push({
                content: '🖼️ EasyUI',
                has_submenu: true,
                callback: make_EasyUImenu
            });
        }
        options.push(null); // inserts a divider

      return options;
    };

    // Add configure override for UINode to restore widgets on load
    if (nodeTypeInfo.comfyClass === 'UINode') {
        const originalOnAdded = proto.onAdded;
        const originalOnRemoved = proto.onRemoved;
        const originalConfigure = proto.configure;

        proto.onAdded = function() {
            // call any existing onAdded first
            if (originalOnAdded) originalOnAdded.apply(this, arguments);
    
            // if this UINode was NOT created via createMirror (no original_node_id),
            // add a label or change its title
            setTimeout(() => {
                // Need timeout or else this.properties.original_node_id isnt set in time for the mirrored uinodes
                if (!this.properties?.original_node_id) {
                    this.title = '⚠️ Orphan UINode';

                    const element = document.createElement('span');
                    element.innerText = 'This UINode is not linked. It should not be created manually. Please right click on a node and select "🖼️ EasyUI – Create Mirror Copy"';
                    this.addDOMWidget('Notice', 'customtext', element);

                    this.width = 355;
                    this.height = 122;
                    
                    // force a redraw so the new widget/title shows up immediately
                    app.canvas.setDirty(true);
                    app.canvas.draw(true);
                }
            }, 0);
        }

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

        proto.onRemoved = function() {
            // 1) restore any original callbacks
            const originalNodeId = this.properties.original_node_id;
            const originalNode = app.canvas.graph.getNodeById(originalNodeId);
            if (originalNode && originalNode.widgets) {
                originalNode.widgets.forEach(w => {
                    if (w._easyui_originalCallback) {
                        w.callback = w._easyui_originalCallback;
                        delete w._easyui_originalCallback;
                    }
                });
            }

            // 2) call the original onRemoved if there was one
            if (originalOnRemoved) {
                originalOnRemoved.apply(this, arguments);
            }
        }
    }
  }
});


const MOVE_UP = 0;
const MOVE_DOWN = 1;
function make_EasyUImenu(value, options, e, menu, node) {
    var subOptions = [];
    if(node.widgets.length > 1 ) {
        subOptions.push({
            content: 'Move widget up',
            has_submenu: true,
            callback: () => make_moveSubmenu(e, menu, node, MOVE_UP)
        });
        subOptions.push({
            content: 'Move widget down',
            has_submenu: true,
            callback: () => make_moveSubmenu(e, menu, node, MOVE_DOWN)
        });
    }
    subOptions.push({
        content: 'Jump to original node',
        callback: () => {
            const originalNodeId = node.properties.original_node_id;
            if (originalNodeId) {
                const originalNode = app.canvas.graph.getNodeById(originalNodeId);
                focusNode(originalNode);
            } else {
                console.warn(`Original node with ID ${originalNodeId} not found.`);
            }
        }
    });
    subOptions.push({
        content: 'Toggle widget visibility',
        has_submenu: true,
        callback: () => make_submenu(e, menu, node)
    });

    subOptions.push({
        content: '[DEBUG]',
        callback: () => {
            console.log(node);
        }
    });

    const submenu = new LiteGraph.ContextMenu(
        subOptions,
        { 
            event: e,
            parentMenu: menu, 
            node:node
        }
    )
}

function make_moveSubmenu(e, menu, node, direction) {
    var subOptions = [];
    var i = 0;

    node.widgets.forEach(widget => {
        if(direction === MOVE_UP) {
            if(i > 0) {
                subOptions.push(`Move ${widget.name} up`);
            }
        } else if(direction === MOVE_DOWN) {
            if(i < node.widgets.length - 1) {
                subOptions.push(`Move ${widget.name} down`);
            }
        }
        i++;
    });

    const submenu = new LiteGraph.ContextMenu(
        subOptions,
        { 
            event: e, 
            callback: function (v) { 
                const widgetName = v.replace(/Move | up| down/g, "");
                const widgetIndex = node.widgets.findIndex(w => w.name === widgetName);
                if (widgetIndex !== -1) {
                    const widget = node.widgets[widgetIndex];
                    if(direction === MOVE_UP && widgetIndex > 0) {
                        node.widgets.splice(widgetIndex, 1);
                        node.widgets.splice(widgetIndex - 1, 0, widget);
                    } else if(direction === MOVE_DOWN && widgetIndex < node.widgets.length - 1) {
                        node.widgets.splice(widgetIndex, 1);
                        node.widgets.splice(widgetIndex + 1, 0, widget);
                    }
                    // Save the new widget order
                    node.properties.widgetOrder = node.widgets.map(w => w.name);
                    app.canvas.setDirty(true, true);
                    app.canvas.draw(true);
                }
            }, 
            parentMenu: menu, 
            node:node
        }
    )
}

function make_submenu(e, menu, node) {
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
                    if(!widget.computedDisabled && !ignoredWidgets.includes(widget.type)) {
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

function cloneWidgets(originalNode, uiNode) {
    uiNode.widgets = [];
    uiNode.widgets_values = [];
    uiNode.properties.hiddenWidgets = uiNode.properties.hiddenWidgets || [];
    uiNode.properties.widgetOrder = uiNode.properties.widgetOrder || [];

    if(originalNode && originalNode.widgets) {
        // Create a map of original widgets for easier lookup
        const widgetMap = new Map(originalNode.widgets.map(widget => [widget.name, widget]));
        
        // First, try to add widgets in the saved order
        const orderedWidgets = uiNode.properties.widgetOrder
            .map(name => widgetMap.get(name))
            .filter(widget => widget !== undefined);
        
        // Add any remaining widgets that weren't in the saved order
        const remainingWidgets = originalNode.widgets.filter(
            widget => !uiNode.properties.widgetOrder.includes(widget.name)
        );
        
        // Combine ordered and remaining widgets
        const allWidgets = [...orderedWidgets, ...remainingWidgets];

        allWidgets.forEach(origW => {
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
                origW._easyui_originalCallback = oldCallback;
                var newW;
                
                switch (type) {
                    case 'custom':
                        // [TODO]
                        break;
                    case 'customtext':
                        const element = origW.element.cloneNode(true);
                        newW = uiNode.addDOMWidget(origW.name, type, element);
                        newW.inputEl = element;
                        
                        // initialize value
                        newW.value = origW.value;

                        // 2) Listen on the cloned textarea → push back to original
                        element.addEventListener('input', e => {
                            if (newW.isSyncing) return;
                            newW.isSyncing = true;
                            origW.element.value = e.target.value;
                            origW.value = e.target.value;
                            app.canvas.setDirty(true);
                            newW.isSyncing = false;
                        });

                        // 3) Listen on the original textarea → push forward to clone
                        origW.element.addEventListener('input', e => {
                            if (newW.isSyncing) return;
                            newW.isSyncing = true;
                            element.value = e.target.value;
                            newW.value = e.target.value;
                            app.canvas.setDirty(true);
                            newW.isSyncing = false;
                        });
                        break;
                    default:
                        newW = uiNode.addWidget(
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
                        break;
                }
            } catch (err) {
                console.warn('Skipping unsupported widget:', origW, err);
            }
        });
    }
}

function focusNode(node) {
    const lgcanvas = app.canvas;           // your LiteGraphCanvas / ComfyUI canvas instance
    const domCanvas = lgcanvas.canvas;     // the actual <canvas> element
    const scale = lgcanvas.ds.scale;   // current zoom

    // compute center of viewport in graph coords
    const centerX = (domCanvas.width  / 2) / scale - (node.pos[0] + node.width / 2);
    const centerY = (domCanvas.height / 2) / scale - (node.pos[1] + node.height / 2);

    // set new offset
    lgcanvas.ds.offset = [ centerX, centerY ];
    lgcanvas.setDirty(true);
    lgcanvas.draw(true, true);
}