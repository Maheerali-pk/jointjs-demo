"use client";

import { useEffect, useRef, useState } from "react";
import { dia, shapes } from "@joint/core";

export default function Home() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<dia.Graph | null>(null);
  const paperRef = useRef<dia.Paper | null>(null);
  const [draggedShape, setDraggedShape] = useState<string | null>(null);
  const [editingElement, setEditingElement] = useState<{
    element: dia.Element;
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const [editingLink, setEditingLink] = useState<{
    link: dia.Link;
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const [selectedLinkForTools, setSelectedLinkForTools] = useState<{
    link: dia.Link;
    x: number;
    y: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize graph and paper
    const graph = new dia.Graph({}, { cellNamespace: shapes });
    graphRef.current = graph;

    // Get canvas dimensions with fallback
    const getCanvasDimensions = () => {
      if (canvasRef.current) {
        return {
          width: canvasRef.current.clientWidth || 800,
          height: canvasRef.current.clientHeight || 600,
        };
      }
      return { width: 800, height: 600 };
    };

    const { width, height } = getCanvasDimensions();

    const paper = new dia.Paper({
      el: canvasRef.current,
      model: graph,
      width,
      height,
      gridSize: 10,
      drawGrid: true,
      background: {
        color: "#f8f9fa",
      },
      cellViewNamespace: shapes,
      interactive: {
        linkMove: true,
        elementMove: true,
        addLinkFromMagnet: true,
      },
      snapLinks: {
        radius: 20,
      },
    });

    // Handle window resize
    const handleResize = () => {
      if (canvasRef.current && paper) {
        const { width: newWidth, height: newHeight } = getCanvasDimensions();
        paper.setDimensions(newWidth, newHeight);
      }
    };

    window.addEventListener("resize", handleResize);
    paperRef.current = paper;

    // Show border and ports on element hover
    paper.on("element:pointerenter", (elementView) => {
      const element = elementView.model as dia.Element;

      // Show 4px border outline around element
      const currentAttrs = element.attr() as any;
      element.attr({
        body: {
          ...(currentAttrs.body || {}),
          strokeWidth: 4,
          stroke: "#3498db",
        },
      });

      // Show ports (connection points at the border)
      const ports = element.prop("ports");
      if (ports && ports.items) {
        ports.items.forEach((port: any) => {
          if (port.id) {
            element.portProp(port.id, "attrs/portBody/opacity", 1);
            element.portProp(port.id, "attrs/portBody/visibility", "visible");
          }
        });
      }
    });

    paper.on("element:pointerleave", (elementView) => {
      const element = elementView.model as dia.Element;

      // Restore normal border
      const currentAttrs = element.attr() as any;
      // Determine original stroke based on shape color
      let originalStroke = "#2980b9";
      if (currentAttrs.body?.fill === "#e74c3c") {
        originalStroke = "#c0392b";
      } else if (currentAttrs.body?.fill === "#2ecc71") {
        originalStroke = "#27ae60";
      }

      element.attr({
        body: {
          ...(currentAttrs.body || {}),
          strokeWidth: 2,
          stroke: originalStroke,
        },
      });

      // Hide ports
      const ports = element.prop("ports");
      if (ports && ports.items) {
        ports.items.forEach((port: any) => {
          if (port.id) {
            element.portProp(port.id, "attrs/portBody/opacity", 0);
            element.portProp(port.id, "attrs/portBody/visibility", "hidden");
          }
        });
      }
    });

    // Handle link creation - only allow from ports (magnets)
    paper.on("link:new", (linkView) => {
      const link = linkView.model as dia.Link;

      // Verify the link source is from a port (magnet)
      // If no source port, this link was created from body area - remove it
      const source = link.get("source") as any;
      if (source && typeof source === "object" && !("port" in source)) {
        // Link was created from body area, not from a port - remove it
        link.remove();
        return;
      }

      link.attr({
        line: {
          stroke: "#34495e",
          strokeWidth: 2,
          targetMarker: {
            type: "path",
            d: "M 10 -5 0 0 10 5 z",
            fill: "#34495e",
          },
        },
      });
      // Ensure link can be reconnected
      link.set("smooth", true);
    });

    // Track if link endpoint is being dragged
    let isDraggingEndpoint = false;
    let draggedLink: dia.Link | null = null;

    // Update link style when endpoint dragging starts
    paper.on("link:move", (linkView) => {
      const link = linkView.model as dia.Link;
      isDraggingEndpoint = true;
      draggedLink = link;
      // Highlight link when dragging endpoint
      link.attr({
        line: {
          stroke: "#3498db",
          strokeWidth: 3,
          strokeDasharray: "5,5",
          targetMarker: {
            type: "path",
            d: "M 10 -5 0 0 10 5 z",
            fill: "#3498db",
          },
        },
      });
    });

    // Restore link style after endpoint move completes
    paper.on("link:moveend", (linkView) => {
      const link = linkView.model as dia.Link;
      isDraggingEndpoint = false;
      draggedLink = null;
      // Check if link is selected
      if (selectedLinks.has(link)) {
        link.attr({
          line: {
            stroke: "#2ecc71",
            strokeWidth: 3,
            targetMarker: {
              type: "path",
              d: "M 10 -5 0 0 10 5 z",
              fill: "#2ecc71",
            },
          },
        });
      } else {
        link.attr({
          line: {
            stroke: "#34495e",
            strokeWidth: 2,
            targetMarker: {
              type: "path",
              d: "M 10 -5 0 0 10 5 z",
              fill: "#34495e",
            },
          },
        });
      }
    });

    // Track selected links
    const selectedLinks = new Set<dia.Link>();

    // Handle link selection on click (but not when dragging endpoint)
    paper.on("link:pointerclick", (linkView, evt) => {
      // Don't select if we just finished dragging an endpoint
      if (isDraggingEndpoint) {
        return;
      }
      evt.stopPropagation();
      const link = linkView.model as dia.Link;

      // Get link midpoint for positioning tools
      const sourcePoint = link.getSourcePoint();
      const targetPoint = link.getTargetPoint();
      const midX = (sourcePoint.x + targetPoint.x) / 2;
      const midY = (sourcePoint.y + targetPoint.y) / 2;

      // Get paper and canvas container positions
      const paperRect = paper.el.getBoundingClientRect();
      const canvasContainer = canvasRef.current?.parentElement;
      const containerRect = canvasContainer?.getBoundingClientRect();

      // Toggle selection
      if (selectedLinks.has(link)) {
        selectedLinks.delete(link);
        setSelectedLinkForTools(null);
        // Reset to normal style
        link.attr({
          line: {
            stroke: "#34495e",
            strokeWidth: 2,
            targetMarker: {
              type: "path",
              d: "M 10 -5 0 0 10 5 z",
              fill: "#34495e",
            },
          },
        });
      } else {
        // Deselect all other links first
        selectedLinks.forEach((selectedLink) => {
          selectedLink.attr({
            line: {
              stroke: "#34495e",
              strokeWidth: 2,
              targetMarker: {
                type: "path",
                d: "M 10 -5 0 0 10 5 z",
                fill: "#34495e",
              },
            },
          });
        });
        selectedLinks.clear();
        setSelectedLinkForTools(null);

        // Select this link
        selectedLinks.add(link);
        link.attr({
          line: {
            stroke: "#2ecc71",
            strokeWidth: 3,
            targetMarker: {
              type: "path",
              d: "M 10 -5 0 0 10 5 z",
              fill: "#2ecc71",
            },
          },
        });

        // Show tools for selected link
        if (containerRect) {
          const toolX = midX + (paperRect.left - containerRect.left);
          const toolY = midY + (paperRect.top - containerRect.top);
          setSelectedLinkForTools({
            link,
            x: toolX,
            y: toolY,
          });
        }
      }
    });

    // Handle keyboard deletion
    const handleKeyDown = (evt: KeyboardEvent) => {
      // Delete or Backspace key
      if (
        (evt.key === "Delete" || evt.key === "Backspace") &&
        !evt.ctrlKey &&
        !evt.metaKey
      ) {
        if (selectedLinks.size > 0) {
          selectedLinks.forEach((link) => {
            link.remove();
          });
          selectedLinks.clear();
          evt.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // Deselect when clicking on empty space
    paper.on("blank:pointerclick", () => {
      selectedLinks.forEach((link) => {
        link.attr({
          line: {
            stroke: "#34495e",
            strokeWidth: 2,
            targetMarker: {
              type: "path",
              d: "M 10 -5 0 0 10 5 z",
              fill: "#34495e",
            },
          },
        });
      });
      selectedLinks.clear();
      setSelectedLinkForTools(null);
    });

    // Clean up selected links when they're removed
    graph.on("remove", (cell) => {
      if (cell instanceof dia.Link) {
        selectedLinks.delete(cell);
        // Close link editor if the link being edited is removed
        setEditingLink((current) => {
          if (current && current.link.id === cell.id) {
            return null;
          }
          return current;
        });
        // Close link tools if the selected link is removed
        setSelectedLinkForTools((current) => {
          if (current && current.link.id === cell.id) {
            return null;
          }
          return current;
        });
      }
      // Close editor if the element being edited is removed
      if (cell instanceof dia.Element) {
        setEditingElement((current) => {
          if (current && current.element.id === cell.id) {
            return null;
          }
          return current;
        });
      }
    });

    // Handle double-click on element to edit text
    paper.on("element:pointerdblclick", (elementView, evt) => {
      evt.stopPropagation();
      const element = elementView.model as dia.Element;
      const bbox = element.getBBox();

      // Get paper and canvas container positions
      const paperRect = paper.el.getBoundingClientRect();
      const canvasContainer = canvasRef.current?.parentElement;
      const containerRect = canvasContainer?.getBoundingClientRect();

      if (!containerRect) return;

      // Get current text from label
      const currentText = element.attr("label/text") || "";

      // Calculate position relative to canvas container
      // Position input below the node, centered horizontally
      const paperX = bbox.x + bbox.width / 2;
      const paperY = bbox.y + bbox.height + 10; // 10px below the node

      // Convert paper coordinates to container coordinates
      // Account for the padding (p-4 = 16px) and border
      const inputX = paperX + (paperRect.left - containerRect.left);
      const inputY = paperY + (paperRect.top - containerRect.top);

      setEditingElement({
        element,
        x: inputX,
        y: inputY,
        text: currentText,
      });
    });

    // Handle drop on paper
    const handlePaperDrop = (evt: DragEvent) => {
      evt.preventDefault();
      const shapeType = evt.dataTransfer?.getData("shapeType");
      if (!shapeType || !paper) return;

      const point = paper.snapToGrid({
        x: evt.offsetX,
        y: evt.offsetY,
      });

      let shape: dia.Element;

      switch (shapeType) {
        case "circle":
          shape = new shapes.standard.Circle({
            position: point,
            size: { width: 80, height: 80 },
            attrs: {
              body: {
                fill: "#3498db",
                stroke: "#2980b9",
                strokeWidth: 2,
              },
              label: {
                text: "Circle",
                fill: "#fff",
                fontSize: 14,
                fontWeight: "bold",
              },
            },
          });
          break;
        case "square":
          shape = new shapes.standard.Rectangle({
            position: point,
            size: { width: 80, height: 80 },
            attrs: {
              body: {
                fill: "#e74c3c",
                stroke: "#c0392b",
                strokeWidth: 2,
              },
              label: {
                text: "Square",
                fill: "#fff",
                fontSize: 14,
                fontWeight: "bold",
              },
            },
          });
          break;
        case "triangle":
          shape = new shapes.standard.Polygon({
            position: point,
            size: { width: 80, height: 80 },
            attrs: {
              body: {
                fill: "#2ecc71",
                stroke: "#27ae60",
                strokeWidth: 2,
                refPoints: "0,10 10,0 20,10",
              },
              label: {
                text: "Triangle",
                fill: "#fff",
                fontSize: 14,
                fontWeight: "bold",
              },
            },
          });
          break;
        default:
          return;
      }

      // Remove magnet from body - connections only from ports
      // The body area will be used for moving the node, not for creating connections
      shape.attr("body/magnet", false);

      // Add ports for connection points (visible on hover)
      // Ports are the only way to create connections - body area is for movement only
      shape.prop("ports", {
        groups: {
          top: {
            position: { name: "top" },
            attrs: {
              portBody: {
                magnet: true,
                r: 8,
                fill: "#3498db",
                stroke: "#2980b9",
                strokeWidth: 2,
                opacity: 0,
                visibility: "hidden",
                cursor: "crosshair",
              },
            },
            markup: [
              {
                tagName: "circle",
                selector: "portBody",
              },
            ],
          },
          right: {
            position: { name: "right" },
            attrs: {
              portBody: {
                magnet: true,
                r: 8,
                fill: "#3498db",
                stroke: "#2980b9",
                strokeWidth: 2,
                opacity: 0,
                visibility: "hidden",
                cursor: "crosshair",
              },
            },
            markup: [
              {
                tagName: "circle",
                selector: "portBody",
              },
            ],
          },
          bottom: {
            position: { name: "bottom" },
            attrs: {
              portBody: {
                magnet: true,
                r: 8,
                fill: "#3498db",
                stroke: "#2980b9",
                strokeWidth: 2,
                opacity: 0,
                visibility: "hidden",
                cursor: "crosshair",
              },
            },
            markup: [
              {
                tagName: "circle",
                selector: "portBody",
              },
            ],
          },
          left: {
            position: { name: "left" },
            attrs: {
              portBody: {
                magnet: true,
                r: 8,
                fill: "#3498db",
                stroke: "#2980b9",
                strokeWidth: 2,
                opacity: 0,
                visibility: "hidden",
                cursor: "crosshair",
              },
            },
            markup: [
              {
                tagName: "circle",
                selector: "portBody",
              },
            ],
          },
        },
        items: [
          { id: "top", group: "top" },
          { id: "right", group: "right" },
          { id: "bottom", group: "bottom" },
          { id: "left", group: "left" },
        ],
      });

      graph.addCell(shape);
      setDraggedShape(null);
    };

    const handlePaperDragOver = (evt: DragEvent) => {
      evt.preventDefault();
    };

    const paperEl = paper.el;
    paperEl.addEventListener("drop", handlePaperDrop);
    paperEl.addEventListener("dragover", handlePaperDragOver);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      paperEl.removeEventListener("drop", handlePaperDrop);
      paperEl.removeEventListener("dragover", handlePaperDragOver);
      paper.remove();
      graph.clear();
    };
  }, []);

  const handleDragStart = (shapeType: string) => (e: React.DragEvent) => {
    setDraggedShape(shapeType);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("shapeType", shapeType);
  };

  const handleDragEnd = () => {
    setDraggedShape(null);
  };

  // Focus input when editing starts (only when editingElement is first set)
  useEffect(() => {
    if (editingElement && inputRef.current) {
      // Use setTimeout to ensure the input is rendered before focusing
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [editingElement?.element.id]); // Only re-run when the element ID changes, not the text

  // Focus link input when editing starts
  useEffect(() => {
    if (editingLink && linkInputRef.current) {
      const timer = setTimeout(() => {
        if (linkInputRef.current) {
          linkInputRef.current.focus();
          linkInputRef.current.select();
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [editingLink?.link.id]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <div className="w-full border-b border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-black dark:text-zinc-50">
            JointJS Canvas
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            💡 Hover nodes to see connection points • Drag from ports to connect
            • Double-click nodes to edit text • Click links to select
          </p>
        </div>
      </div>

      <div className="flex flex-1">
        {/* Toolbar */}
        <div className="w-64 border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
            Shapes
          </h2>
          <div className="flex flex-col gap-3">
            {/* Circle */}
            <div
              draggable
              onDragStart={handleDragStart("circle")}
              onDragEnd={handleDragEnd}
              className={`flex cursor-move items-center gap-3 rounded-lg border-2 border-dashed border-zinc-300 p-3 transition-all hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 ${
                draggedShape === "circle" ? "opacity-50" : ""
              }`}
            >
              <div className="h-12 w-12 rounded-full bg-blue-500"></div>
              <span className="font-medium text-black dark:text-zinc-50">
                Circle
              </span>
            </div>

            {/* Square */}
            <div
              draggable
              onDragStart={handleDragStart("square")}
              onDragEnd={handleDragEnd}
              className={`flex cursor-move items-center gap-3 rounded-lg border-2 border-dashed border-zinc-300 p-3 transition-all hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 ${
                draggedShape === "square" ? "opacity-50" : ""
              }`}
            >
              <div className="h-12 w-12 rounded bg-red-500"></div>
              <span className="font-medium text-black dark:text-zinc-50">
                Square
              </span>
            </div>

            {/* Triangle */}
            <div
              draggable
              onDragStart={handleDragStart("triangle")}
              onDragEnd={handleDragEnd}
              className={`flex cursor-move items-center gap-3 rounded-lg border-2 border-dashed border-zinc-300 p-3 transition-all hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 ${
                draggedShape === "triangle" ? "opacity-50" : ""
              }`}
            >
              <div className="h-0 w-0 border-b-[48px] border-l-[24px] border-r-[24px] border-b-green-500 border-l-transparent border-r-transparent"></div>
              <span className="font-medium text-black dark:text-zinc-50">
                Triangle
              </span>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 p-4 relative">
          <div className="h-full w-full rounded-lg border-2 border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900 overflow-hidden">
            <div ref={canvasRef} className="h-full w-full"></div>
          </div>

          {/* Text editing input for elements */}
          {editingElement && paperRef.current && (
            <input
              key={editingElement.element.id}
              ref={inputRef}
              type="text"
              value={editingElement.text}
              onChange={(e) => {
                const newValue = e.target.value;
                setEditingElement((prev) => {
                  if (!prev) return null;
                  return {
                    ...prev,
                    text: newValue,
                  };
                });
              }}
              onBlur={(e) => {
                setEditingElement((prev) => {
                  if (prev) {
                    prev.element.attr("label/text", prev.text);
                  }
                  return null;
                });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setEditingElement((prev) => {
                    if (prev) {
                      prev.element.attr("label/text", prev.text);
                    }
                    return null;
                  });
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditingElement(null);
                }
              }}
              className="absolute bg-white dark:bg-zinc-800 border-2 border-blue-500 rounded px-2 py-1 text-sm font-medium text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg z-50"
              style={{
                left: `${editingElement.x}px`,
                top: `${editingElement.y}px`,
                transform: "translate(-50%, 100%)",
                minWidth: "100px",
              }}
              autoFocus
            />
          )}

          {/* Link tools (text and delete icons) */}
          {selectedLinkForTools && paperRef.current && (
            <div
              className="absolute flex gap-2 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-300 dark:border-zinc-700 p-1 z-50"
              style={{
                left: `${selectedLinkForTools.x}px`,
                top: `${selectedLinkForTools.y}px`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const link = selectedLinkForTools.link;

                  // Get current label text if it exists
                  const labels = link.labels() || [];
                  let currentText = "";
                  if (labels.length > 0 && labels[0].attrs?.text?.text) {
                    currentText = labels[0].attrs.text.text;
                  }

                  // Get paper and canvas container positions
                  const paperRect =
                    paperRef.current?.el.getBoundingClientRect();
                  const canvasContainer = canvasRef.current?.parentElement;
                  const containerRect =
                    canvasContainer?.getBoundingClientRect();

                  if (paperRect && containerRect) {
                    const sourcePoint = link.getSourcePoint();
                    const targetPoint = link.getTargetPoint();
                    const midX = (sourcePoint.x + targetPoint.x) / 2;
                    const midY = (sourcePoint.y + targetPoint.y) / 2;

                    const inputX = midX + (paperRect.left - containerRect.left);
                    const inputY = midY + (paperRect.top - containerRect.top);

                    setEditingLink({
                      link,
                      x: inputX,
                      y: inputY,
                      text: currentText,
                    });
                    setSelectedLinkForTools(null);
                  }
                }}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded transition-colors"
                title="Add text"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-zinc-700 dark:text-zinc-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h7"
                  />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  selectedLinkForTools.link.remove();
                  setSelectedLinkForTools(null);
                }}
                className="p-2 hover:bg-red-100 dark:hover:bg-red-900 rounded transition-colors"
                title="Delete link"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-red-600 dark:text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          )}

          {/* Text editing input for links */}
          {editingLink && paperRef.current && (
            <input
              key={editingLink.link.id}
              ref={linkInputRef}
              type="text"
              value={editingLink.text}
              onChange={(e) => {
                const newValue = e.target.value;
                setEditingLink((prev) => {
                  if (!prev) return null;
                  return {
                    ...prev,
                    text: newValue,
                  };
                });
              }}
              onBlur={(e) => {
                setEditingLink((prev) => {
                  if (prev) {
                    // Remove existing labels first (remove all by index)
                    const labels = prev.link.labels() || [];
                    for (let i = labels.length - 1; i >= 0; i--) {
                      prev.link.removeLabel(i);
                    }

                    if (prev.text.trim()) {
                      // Add label to the middle of the link (position 0.5 = 50% along the link)
                      prev.link.appendLabel({
                        attrs: {
                          text: {
                            text: prev.text,
                            fill: "#34495e",
                            fontSize: 12,
                            fontWeight: "normal",
                            textAnchor: "middle",
                            textVerticalAnchor: "middle",
                          },
                        },
                        position: {
                          distance: 0.5,
                        },
                      });
                    }
                  }
                  return null;
                });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setEditingLink((prev) => {
                    if (prev) {
                      // Remove existing labels first (remove all by index)
                      const labels = prev.link.labels() || [];
                      for (let i = labels.length - 1; i >= 0; i--) {
                        prev.link.removeLabel(i);
                      }

                      if (prev.text.trim()) {
                        // Add label to the middle of the link (position 0.5 = 50% along the link)
                        prev.link.appendLabel({
                          attrs: {
                            text: {
                              text: prev.text,
                              fill: "#34495e",
                              fontSize: 12,
                              fontWeight: "normal",
                              textAnchor: "middle",
                              textVerticalAnchor: "middle",
                            },
                          },
                          position: {
                            distance: 0.5,
                          },
                        });
                      }
                    }
                    return null;
                  });
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditingLink(null);
                }
              }}
              className="absolute bg-white dark:bg-zinc-800 border-2 border-blue-500 rounded px-2 py-1 text-sm font-medium text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg z-50"
              style={{
                left: `${editingLink.x}px`,
                top: `${editingLink.y}px`,
                transform: "translate(-50%, -50%)",
                minWidth: "100px",
              }}
              autoFocus
            />
          )}
        </div>
      </div>
    </div>
  );
}
