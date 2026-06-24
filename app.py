from xml.parsers.expat import errors

from flask import Flask, render_template, request, jsonify
import networkx as nx
from sympy import expand, latex

app = Flask(__name__)

# ---------------- GRAPH ----------------
def build_graph(vertices, edges, graph_type):
    G = nx.DiGraph() if graph_type == "directed" else nx.Graph()
    G.add_nodes_from(vertices)
    G.add_edges_from(edges)
    return G

def get_graph_type(data):
    return data.get("type", "undirected")

# ---------------- INPUT VALIDATION ----------------
def validate_input(vertices_str, edges_str, graph_type="undirected"):
    errors = []

    # ---------- vertices ----------
    if isinstance(vertices_str, str):
        raw_vertices = [v.strip() for v in vertices_str.split(",")]

        if any(v == "" for v in raw_vertices):
            errors.append(
        "Empty vertex name detected. Please remove extra commas."
    )

        vertices = [v for v in raw_vertices if v]    
    
    else:
        vertices = vertices_str

    if not isinstance(vertices, list):
        return ["Vertices must be a comma-separated string or list"], [], []

    if len(vertices) != len(set(vertices)):
        errors.append("Duplicate vertices detected.")

    vertex_set = set(vertices)

    # ---------- edges  ----------
    edges = []

    if isinstance(edges_str, str):
        raw_edges = [e.strip() for e in edges_str.split(",") if e.strip()]
    else:
        raw_edges = edges_str

    for e in raw_edges:
        if isinstance(e, str):
            if "-" not in e:
                errors.append(f"Invalid edge format: {e}")
                continue
            u, v = [x.strip() for x in e.split("-")]
        else:
            if len(e) != 2:
                errors.append(f"Invalid edge: {e}")
                continue
            u, v = e

        if u not in vertex_set or v not in vertex_set:
            errors.append(f"Edge {u}-{v} uses unknown vertex")
            continue

        if u == v:
            errors.append(f"Self-loop not allowed: {u}-{v}")
            continue

        if graph_type == "undirected":
            edges.append(tuple(sorted((u, v))))
        else:
            edges.append((u, v))

    edges = list(set(edges))

    return errors, vertices, edges

@app.route("/")
def home():
    return render_template("index.html")

# ---------------- PLANARITY ----------------
def identify_kuratowski(kur):
    H = kur.copy()

    changed = True
    while changed:
        changed = False

        for v in list(H.nodes()):
            if H.degree(v) == 2:

                neighbors = list(H.neighbors(v))

                if len(neighbors) == 2:
                    u, w = neighbors

                    if u != w:
                        H.add_edge(u, w)

                    H.remove_node(v)
                    changed = True
                    break

    n = H.number_of_nodes()
    m = H.number_of_edges()
    degrees = sorted(dict(H.degree()).values())

    if (
        n == 5
        and m == 10
        and degrees == [4, 4, 4, 4, 4]
    ):
        return "K5"

    if (
        n == 6
        and m == 9
        and degrees == [3, 3, 3, 3, 3, 3]
        and nx.is_bipartite(H)
    ):
        return "K3,3"

    return "Kuratowski Subgraph"
@app.route("/planarity", methods=["POST"])
def planarity():
    data = request.get_json(force=True)
    graph_type = get_graph_type(data)

    errors, vertices, edges = validate_input(
        data["vertices"], data["edges"], graph_type
    )

    if errors:
        return jsonify({"error": True, "messages": errors})

    if graph_type == "directed":
        return jsonify({"error": True, "messages": ["Planarity not defined for directed graphs"]})

    G = build_graph(vertices, edges, graph_type)

    is_planar, kur = nx.check_planarity(G, counterexample=True)

    if not is_planar and kur:

        kur_nodes = list(kur.nodes())
        kur_edges = list(kur.edges())

        kur_type = identify_kuratowski(kur)

    else:
        kur_nodes = []
        kur_edges = []
        kur_type = None

    return jsonify({
        "planar": is_planar,
        "kuratowski_nodes": kur_nodes,
        "kuratowski_edges": kur_edges,
        "kuratowski_type": kur_type
    })

# ---------------- CONNECTIVITY ----------------
@app.route("/connectivity", methods=["POST"])
def connectivity():

    data = request.get_json(force=True)

    graph_type = get_graph_type(data)

    errors, vertices, edges = validate_input(
        data["vertices"],
        data["edges"],
        graph_type
    )

    if errors:
        return jsonify({
            "error": True,
            "messages": errors
        })

    v_list = vertices
    e_list = edges

    # ---------------- UNDIRECTED ----------------
    if graph_type == "undirected":

        G = nx.Graph()
        G.add_nodes_from(v_list)
        G.add_edges_from(e_list)

        connected = nx.is_connected(G) if len(G) > 0 else False

        components = [
            list(c)
            for c in nx.connected_components(G)
        ]

        return jsonify({
            "type": "undirected",
            "connected": connected,
            "components": components,
            "edge_connectivity":
                nx.edge_connectivity(G) if len(G) > 1 else 0,
            "vertex_connectivity":
                nx.node_connectivity(G) if len(G) > 1 else 0
        })

    # ---------------- DIRECTED ----------------
    else:

        G = nx.DiGraph()
        G.add_nodes_from(v_list)
        G.add_edges_from(e_list)

        strongly_connected = (
            nx.is_strongly_connected(G)
            if len(G) > 0 else False
        )

        weakly_connected = (
            nx.is_weakly_connected(G)
            if len(G) > 0 else False
        )

        strong_components = [
            list(c)
            for c in nx.strongly_connected_components(G)
        ]

        return jsonify({
            "type": "directed",
            "strongly_connected": strongly_connected,
            "weakly_connected": weakly_connected,
            "strong_components": strong_components
        })

# ---------------- TUTTE ----------------
@app.route("/tutte", methods=["POST"])
def tutte():

    data = request.get_json(force=True)
    graph_type = get_graph_type(data)

    errors, vertices, edges = validate_input(
        data["vertices"],
        data["edges"],
        graph_type
    )

    if errors:
        return jsonify({
            "error": True,
            "messages": errors
        })

    if graph_type == "directed":
        return jsonify({
            "error": True,
            "messages": ["Tutte only for undirected graphs"]
        })

    G = build_graph(vertices, edges, graph_type)

    if G.number_of_edges() > 20:
        return jsonify({
            "tutte": "Too large",
            "spanning_trees": None
        })

    expr = expand(nx.tutte_polynomial(G))

    spanning_trees = int(
        expr.subs({"x": 1, "y": 1})
    )

    spanning_forests = int(
        expr.subs({"x": 2, "y": 1})
    )

    connected_spanning_subgraphs = int(
        expr.subs({"x": 1, "y": 2})
    )

    total_subgraphs = int(
        expr.subs({"x": 2, "y": 2})
    )

    return jsonify({

        "tutte": latex(expr),

        "spanning_trees": spanning_trees,

        "spanning_forests": spanning_forests,

        "connected_spanning_subgraphs":
            connected_spanning_subgraphs,

        "total_subgraphs": total_subgraphs

    })

# ---------------- CHROMATIC ----------------
@app.route("/chromatic", methods=["POST"])
def chromatic():

    data = request.get_json(force=True)
    graph_type = get_graph_type(data)

    errors, vertices, edges = validate_input(
        data["vertices"],
        data["edges"],
        graph_type
    )

    if errors:
        return jsonify({
            "error": True,
            "messages": errors
        })

    if graph_type == "directed":
        return jsonify({
            "error": True,
            "messages": ["Chromatic only for undirected"]
        })

    G = build_graph(vertices, edges, graph_type)
    nodes = list(G.nodes())

    def safe(node, color, assign):
        return all(
            assign.get(n) != color
            for n in G.neighbors(node)
        )

    def solve(i, k, assign):

        if i == len(nodes):
            return True

        node = nodes[i]

        for c in range(k):

            if safe(node, c, assign):

                assign[node] = c

                if solve(i + 1, k, assign):
                    return True

                del assign[node]

        return False

    # Large graph 
    if G.number_of_nodes() > 15:

        coloring = nx.coloring.greedy_color(
            G,
            strategy="largest_first"
        )

        return jsonify({
            "chromatic_number": max(coloring.values()) + 1,
            "coloring": coloring,
            "approximate": True
        })

    # Small graph
    for k in range(1, len(nodes) + 1):

        assign = {}

        if solve(0, k, assign):

            return jsonify({
                "chromatic_number": k,
                "coloring": assign,
                "approximate": False
            })

    return jsonify({
        "error": True,
        "messages": ["Unable to compute chromatic number"]
    })

# ---------------- CENTRALITY ----------------
@app.route("/centrality", methods=["POST"])
def centrality():
    data = request.get_json(force=True)
    graph_type = get_graph_type(data)

    errors, vertices, edges = validate_input(
        data["vertices"], data["edges"], graph_type
    )

    if errors:
        return jsonify({"error": True, "messages": errors})

    G = build_graph(vertices, edges, graph_type)

    result = {
        "degree": nx.degree_centrality(G),
        "betweenness": nx.betweenness_centrality(G),
        "closeness": nx.closeness_centrality(G)
    }

    if graph_type == "directed":
        result["in_degree"] = nx.in_degree_centrality(G)
        result["out_degree"] = nx.out_degree_centrality(G)

    return jsonify(result)

# ---------------- SHORTEST PATH ----------------
@app.route("/shortest_path", methods=["POST"])
def shortest_path():
    data = request.get_json(force=True)
    graph_type = get_graph_type(data)

    errors, vertices, edges = validate_input(
        data["vertices"], data["edges"], graph_type
    )

    if errors:
        return jsonify({"error": True, "messages": errors})

    source = data.get("source")
    target = data.get("target")

    G = build_graph(vertices, edges, graph_type)

    try:
        path = nx.shortest_path(G, source, target)
        return jsonify({
            "path": path,
            "distance": len(path) - 1
        })
    except nx.NetworkXNoPath:
        return jsonify({"error": True, "messages": ["No path"]})

# ---------------- ECCENTRICITY ----------------
@app.route("/eccentricity", methods=["POST"])
def eccentricity():
    data = request.get_json(force=True)
    graph_type = get_graph_type(data)

    errors, vertices, edges = validate_input(
        data["vertices"], data["edges"], graph_type
    )

    if errors:
        return jsonify({"error": True, "messages": errors})

    G = build_graph(vertices, edges, graph_type)

    if graph_type == "directed":
        if not nx.is_strongly_connected(G):
            return jsonify({"connected": False})

        ecc = nx.eccentricity(G)
        return jsonify({"connected": True, "eccentricity": ecc})

    if not nx.is_connected(G):
        res = {}
        for c in nx.connected_components(G):
            sub = G.subgraph(c)
            res[str(list(c))] = nx.eccentricity(sub)

        return jsonify({"connected": False, "eccentricity": res})

    return jsonify({
    "connected": True,
    "eccentricity": nx.eccentricity(G),
    "radius": nx.radius(G),
    "diameter": nx.diameter(G),
    "center": list(nx.center(G)),
    "periphery": list(nx.periphery(G))
    })

# ---------------- RUN ----------------
if __name__ == "__main__":
    app.run(debug=True)