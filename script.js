const cyInstances = {};

function getGraphType() {
    return document.querySelector('input[name="graphType"]:checked').value;
}

function updateFeatureAvailability() {
    const type = getGraphType();

    const features = {
        planarity: type === "undirected",
        connectivity: true,
        tutte: type === "undirected",
        chromatic: type === "undirected",
        eccentricity: true,
        centrality: true,
        shortestPath: true
    };

    for (const [feature, allowed] of Object.entries(features)) {
        const btn = document.querySelector(`[data-feature="${feature}"]`);

        if (!btn) continue;

        btn.disabled = !allowed;
        btn.style.opacity = allowed ? "1" : "0.4";
        btn.style.cursor = allowed ? "pointer" : "not-allowed";
    }
}

function updateConnectivityTheory() {
    const type = getGraphType();

    const undirected = document.getElementById("undirectedConnectivityTheory");
    const directed = document.getElementById("directedConnectivityTheory");

    if (!undirected || !directed) return;

    if (type === "directed") {
        undirected.style.display = "none";
        directed.style.display = "block";
    } else {
        undirected.style.display = "block";
        directed.style.display = "none";
    }
}

// ---------------- TAB SWITCH ----------------
function switchTab(tabId, btn) {
    document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
    document.getElementById(tabId).style.display = "block";

    document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
}

// ---------------- INPUT ----------------
function getInput() {
    const vertices = document.getElementById("vertices").value;
    const edges = document.getElementById("edges").value;

    const vList = [...new Set(
    vertices
        .split(",")
        .map(v => v.trim())
        .filter(v => v)
)];
    const eList = edges
        .split(",")
        .map(e => e.trim())
        .filter(e => e.includes("-"))
        .map(e => e.split("-").map(s => s.trim()));

    return { vertices, edges, vList, eList };
}

// ---------------- GRAPH DRAW ----------------
function drawGraph(
    containerId,
    vertices,
    edges,
    highlightEdges = [],
    coloring = {},
    centrality = {}
) {
    const elements = [];

    const values = Object.values(centrality);
    const minC = values.length ? Math.min(...values) : 0;
    const maxC = values.length ? Math.max(...values) : 1;

    const scaleSize = (c) => {
        if (maxC === minC) return 30;
        return 20 + ((c - minC) / (maxC - minC)) * 50;
    };

    // Nodes
    vertices.forEach(v => {
        const cVal = centrality[v] ?? 0;

        elements.push({
            data: {
                id: v,
                colorIndex: coloring[v] ?? -1,
                size: scaleSize(cVal)
            }
        });
    });

    // Edges
    edges.forEach(([u, v], i) => {
        const isHighlight = highlightEdges.some(
            e => (e[0] === u && e[1] === v) || (e[0] === v && e[1] === u)
        );

        elements.push({
            data: { id: "e" + i, source: u, target: v },
            classes: isHighlight ? "highlight" : ""
        });
    });

    if (cyInstances[containerId]) {
    cyInstances[containerId].destroy();
}
    
    const isDirected = getGraphType() === "directed";
    cyInstances[containerId] = cytoscape({
        container: document.getElementById(containerId),
        elements: elements,
        style: [
            {
                selector: "node",
                style: {
                    "background-color": ele => {
                        const c = ele.data("colorIndex");
                        if (c < 0) return "#0074D9";
                        return `hsl(${(c * 137.5) % 360},70%,50%)`;
                    },
                    "width": "data(size)",
                    "height": "data(size)",
                    "label": "data(id)",
                    "color": "#fff",
                    "text-valign": "center",
                    "text-halign": "center",
                    "font-size": 12,
                    "text-wrap": "wrap",
                    "text-max-width": 80
                }
            },
            {
                selector: "edge",
                style: {
                    "width": 2,
                    "line-color": "#aaa",
                    "target-arrow-shape": isDirected ? "triangle" : "none",
                    "curve-style": "bezier"
                }
},
            {
                selector: ".highlight",
                style: {
                    "line-color": "red",
                    "width": 4
                }
            }
        ],
        layout: { name: "cose", animate: true }
    });
}

// ---------------- GRAPH CONTROLS ----------------

function zoomIn(containerId) {

    const cy = cyInstances[containerId];

    if (!cy) return;

    cy.zoom({
        level: cy.zoom() * 1.2,
        renderedPosition: {
            x: cy.width() / 2,
            y: cy.height() / 2
        }
    });
}

function zoomOut(containerId) {

    const cy = cyInstances[containerId];

    if (!cy) return;

    cy.zoom({
        level: cy.zoom() / 1.2,
        renderedPosition: {
            x: cy.width() / 2,
            y: cy.height() / 2
        }
    });
}

function resetView(containerId) {

    const cy = cyInstances[containerId];

    if (!cy) return;

    cy.fit();
    cy.center();
}

// ---------------- PLANARITY ----------------
async function checkPlanarity() {

    try {

        const { vertices, edges, vList, eList } = getInput();

        const res = await fetch("/planarity", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                vertices,
                edges,
                type: getGraphType()
            })
        });

        if (!res.ok) {
            throw new Error("Server error");
        }

        const data = await res.json();

        if (data.error) {
            document.getElementById("planarityResult").innerHTML =
                data.messages.join("<br>");

            document.getElementById("explanation").innerHTML = "";

            return;
        }

        document.getElementById("planarityResult").innerHTML =
            data.planar ? "Planar" : "Not planar";

        document.getElementById("explanation").innerHTML =
            data.planar
                ? "Graph is planar."
                : "A Kuratowski subgraph corresponding to " + data.kuratowski_type + "  was found.";

        drawGraph(
            "planarityGraph",
            vList,
            eList,
            data.kuratowski_edges || []
        );

    } catch (err) {

        console.error(err);

        document.getElementById("planarityResult").innerHTML =
            "Failed to connect to server.";

        document.getElementById("explanation").innerHTML = "";
    }
}

// ---------------- CONNECTIVITY ----------------
async function checkConnectivity() {

    try {

        const { vertices, edges, vList, eList } = getInput();

        const res = await fetch("/connectivity", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                vertices,
                edges,
                type: getGraphType()
            })
        });

        if (!res.ok) {
            throw new Error("Server error");
        }

        const data = await res.json();
        const box = document.getElementById("connectivityResult");

        if (data.error) {
            box.innerHTML = data.messages.join("<br>");
            return;
        }

        let html = "";

        // ---------------- UNDIRECTED ----------------
        if (getGraphType() === "undirected") {

            html += data.connected ? "Connected" : "Not Connected";

            if (data.components) {
                html += "<br>Components: " +
                    JSON.stringify(data.components);
            }

            if (data.edge_connectivity != null) {
                html += "<br>Edge Connectivity: " + data.edge_connectivity;
                html += "<br>Vertex Connectivity: " + data.vertex_connectivity;
            }
        }

        // ---------------- DIRECTED ----------------
        if (getGraphType() === "directed") {

    if (data.strongly_connected) {
        html += "Strongly Connected: Yes<br>";
        html += "Weakly Connected: Yes (Implied)<br>";
    } else {
        html += "Strongly Connected: No<br>";
        html += "Weakly Connected: " +
            (data.weakly_connected ? "Yes" : "No") + "<br>";
    }

    if (data.strong_components) {
        html += "Strong Components: " +
            JSON.stringify(data.strong_components) + "<br>";
    }
}

        box.innerHTML = html;

        drawGraph("connectivityGraph", vList, eList);

    } catch (err) {

        console.error(err);

        document.getElementById("connectivityResult").innerHTML =
            "Failed to connect to server.";
    }
}

// ---------------- TUTTE ----------------
function formatPolynomial(expr) {
    if (!expr) return "";

    return expr
        .replace(/\*\*/g, "^")
        .replace(/\^(\d+)/g, "<sup>$1</sup>");
}
async function checkTutte() {

    try {

        const { vertices, edges, vList, eList } = getInput();

        document.getElementById("tutteResult").innerHTML = "Computing...";

        const res = await fetch("/tutte", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                vertices,
                edges,
                type: getGraphType()
            })
        });

        if (!res.ok) {
            throw new Error("Server error");
        }

        const data = await res.json();

        if (data.error) {
            document.getElementById("tutteResult").innerHTML =
                data.messages.join("<br>");
            return;
        }

        document.getElementById("tutteResult").innerHTML =
    "<b>T(x,y)</b> = \\( " + data.tutte + " \\)"
    + "<br><br>"
    + "<b>T(G;1,1)</b> = " + data.spanning_trees + " (Spanning Trees)"
    + "<br>"
    + "<b>T(G;2,1)</b> = " + data.spanning_forests + " (Spanning Forests)"
    + "<br>"
    + "<b>T(G;1,2)</b> = " + data.connected_spanning_subgraphs + " (Connected Spanning Subgraphs)"
    + "<br>"
    + "<b>T(G;2,2)</b> = " + data.total_subgraphs + " (Total Subgraphs)";

    MathJax.typesetPromise();

    drawGraph("tutteGraph", vList, eList);

    } catch (err) {

        console.error(err);

        document.getElementById("tutteResult").innerHTML =
            "Failed to connect to server.";
    }
}

// ---------------- CHROMATIC ----------------
async function checkChromatic() {

    try {

        const { vertices, edges, vList, eList } = getInput();

        const res = await fetch("/chromatic", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                vertices,
                edges,
                type: getGraphType()
            })
        });

        if (!res.ok) {
            throw new Error("Server error");
        }

        const data = await res.json();

        if (data.error) {
            document.getElementById("chromatic").innerHTML =
                data.messages.join("<br>");
            return;
        }

        document.getElementById("chromatic").innerHTML =
            "Chromatic Number: " + data.chromatic_number;

        let html = "<b>Coloring:</b><br>";

        for (const [node, color] of Object.entries(data.coloring)) {
            html += `${node} → ${color + 1}<br>`;
        }

        document.getElementById("coloring").innerHTML = html;

        drawGraph(
            "chromaticGraph",
            vList,
            eList,
            [],
            data.coloring
        );

    } catch (err) {

        console.error(err);

        document.getElementById("chromatic").innerHTML =
            "Failed to connect to server.";
    }
}

// ---------------- CENTRALITY ----------------
async function checkCentrality() {

    try {

        const { vertices, edges, vList, eList } = getInput();

        const res = await fetch("/centrality", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                vertices,
                edges,
                type: getGraphType()
            })
        });

        if (!res.ok) {
            throw new Error("Server error");
        }

        const data = await res.json();

        let html = "<b>Degree Centrality</b><br>";

        for (const [n, v] of Object.entries(data.degree)) {
            html += `${n}: ${v.toFixed(3)}<br>`;
        }

        html += "<br><b>Betweenness Centrality</b><br>";

        for (const [n, v] of Object.entries(data.betweenness)) {
            html += `${n}: ${v.toFixed(3)}<br>`;
        }

        html += "<br><b>Closeness Centrality</b><br>";

        for (const [n, v] of Object.entries(data.closeness)) {
            html += `${n}: ${v.toFixed(3)}<br>`;
        }

        document.getElementById("centralityResult").innerHTML = html;

        drawGraph(
            "centralityGraph",
            vList,
            eList,
            [],
            {},
            data.degree
        );

    } catch (err) {

        console.error(err);

        document.getElementById("centralityResult").innerHTML =
            "Failed to connect to server.";
    }
}

// ---------------- SHORTEST PATH ----------------
async function checkShortestPath() {

    try {

        const { vertices, edges, vList, eList } = getInput();

        const source = document.getElementById("source").value.trim();
        const target = document.getElementById("target").value.trim();

        const res = await fetch("/shortest_path", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                vertices,
                edges,
                source,
                target,
                type: getGraphType()
            })
        });

        if (!res.ok) {
            throw new Error("Server error");
        }

        const data = await res.json();

        if (data.error) {
            document.getElementById("shortestResult").innerHTML =
                data.messages.join("<br>");
            return;
        }

        if (!Array.isArray(data.path) || data.path.length === 0) {
            document.getElementById("shortestResult").innerHTML =
                "No path found";
            return;
        }

        document.getElementById("shortestResult").innerHTML =
            "Distance: " + data.distance +
            "<br>Path: " + data.path.join(" → ");

        const pathEdges = [];

        for (let i = 0; i < data.path.length - 1; i++) {
            pathEdges.push([data.path[i], data.path[i + 1]]);
        }

        drawGraph(
            "shortestGraph",
            vList,
            eList,
            pathEdges
        );

    } catch (err) {

        console.error(err);

        document.getElementById("shortestResult").innerHTML =
            "Failed to connect to server.";
    }
}

// ---------------- ECCENTRICITY ----------------
async function checkEccentricity() {

    try {

        const { vertices, edges, vList, eList } = getInput();

        const res = await fetch("/eccentricity", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                vertices,
                edges,
                type: getGraphType()
            })
        });

        if (!res.ok) {
            throw new Error("Server error");
        }

        const data = await res.json();

        let html = "";

        if (data.connected) {

            for (const [n, v] of Object.entries(data.eccentricity)) {
                html += `${n}: ${v}<br>`;
            }

            html += `
<br>Radius: ${data.radius}
<br>Diameter: ${data.diameter}
<br>Center: ${data.center.join(", ")}
<br>Periphery: ${data.periphery.join(", ")}
`;

        } else {

            html = "Graph is disconnected";
        }

        document.getElementById("eccResult").innerHTML = html;

        drawGraph(
            "eccGraph",
            vList,
            eList
        );

    } catch (err) {

        console.error(err);

        document.getElementById("eccResult").innerHTML =
            "Failed to connect to server.";
    }
}