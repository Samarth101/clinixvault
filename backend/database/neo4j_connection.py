"""
Neo4j Connection Pool & Resilient In-Memory Property Graph Fallback.
Provides unified Cypher/Graph execution across connected Neo4j instances
and standalone air-gapped workstations.
"""

import os
import re
from typing import Dict, Any, List, Optional, Set
import networkx as nx
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.database.neo4j")


class Neo4jGraphManager:
    """
    Manages Neo4j Bolt connections with automated fallback to an in-memory
    NetworkX property graph when running air-gapped or without Docker.
    """

    def __init__(
        self,
        uri: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
    ):
        self.uri = uri or os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = user or os.getenv("NEO4J_USER", "neo4j")
        self.password = password or os.getenv("NEO4J_PASSWORD", "clinixvault2026")
        self._driver = None
        self._is_connected = False
        self._memory_graph = nx.MultiDiGraph()
        self._node_labels: Dict[str, str] = {}
        self._sqlite_path = (
            os.getenv("GRAPH_SQLITE_PATH")
            or os.getenv("SQLITE_GRAPH_PATH")
            or os.path.abspath(os.path.join(os.path.dirname(__file__), "clinixvault_edge.db"))
        )
        self._init_sqlite_tables()
        self._init_connection()
        if not self._is_connected:
            self._load_from_sqlite()

    def _init_sqlite_tables(self) -> None:
        """Initializes SQLite tables for durable in-memory property graph fallback."""
        try:
            import sqlite3
            with sqlite3.connect(self._sqlite_path, timeout=3.0) as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS graph_nodes (
                        id TEXT PRIMARY KEY,
                        label TEXT,
                        properties_json TEXT,
                        updated_at REAL
                    )
                """)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS graph_edges (
                        source_id TEXT,
                        target_id TEXT,
                        rel_type TEXT,
                        properties_json TEXT,
                        updated_at REAL,
                        PRIMARY KEY (source_id, target_id, rel_type)
                    )
                """)
                conn.commit()
        except Exception as e:
            logger.debug(f"SQLite graph tables init notice: {e}")

    def _load_from_sqlite(self) -> None:
        """Hydrates in-memory graph from SQLite fallback store on cold startup."""
        try:
            import sqlite3
            import json
            with sqlite3.connect(self._sqlite_path, timeout=3.0) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id, label, properties_json FROM graph_nodes")
                nodes = cursor.fetchall()
                for nid, label, props_json in nodes:
                    props = json.loads(props_json) if props_json else {}
                    self._memory_graph.add_node(nid, id=nid, label=label, **props)
                    self._node_labels[nid] = label

                cursor.execute("SELECT source_id, target_id, rel_type, properties_json FROM graph_edges")
                edges = cursor.fetchall()
                for src, tgt, rel, props_json in edges:
                    props = json.loads(props_json) if props_json else {}
                    if not self._memory_graph.has_node(src):
                        self._memory_graph.add_node(src, id=src, label="Node")
                    if not self._memory_graph.has_node(tgt):
                        self._memory_graph.add_node(tgt, id=tgt, label="Node")
                    self._memory_graph.add_edge(src, tgt, key=rel, rel_type=rel, **props)
                if nodes:
                    logger.info(f"Hydrated {len(nodes)} graph nodes and {len(edges)} edges from SQLite fallback store.")
        except Exception as e:
            logger.debug(f"SQLite graph load notice: {e}")

    def _persist_node_to_sqlite(self, node_id: str, label: str, properties: Dict[str, Any]) -> None:
        """Persists a graph node into SQLite for air-gapped node durability."""
        try:
            import sqlite3
            import json
            import time
            props_clean = {k: v for k, v in properties.items() if k not in ("id", "label")}
            with sqlite3.connect(self._sqlite_path, timeout=3.0) as conn:
                conn.execute(
                    "INSERT INTO graph_nodes (id, label, properties_json, updated_at) VALUES (?, ?, ?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET label=excluded.label, properties_json=excluded.properties_json, updated_at=excluded.updated_at",
                    (node_id, label, json.dumps(props_clean), time.time()),
                )
                conn.commit()
        except Exception as e:
            logger.debug(f"SQLite node persist notice: {e}")

    def _persist_edge_to_sqlite(self, source_id: str, target_id: str, rel_type: str, properties: Dict[str, Any]) -> None:
        """Persists a graph edge into SQLite for air-gapped edge durability."""
        try:
            import sqlite3
            import json
            import time
            with sqlite3.connect(self._sqlite_path, timeout=3.0) as conn:
                conn.execute(
                    "INSERT INTO graph_edges (source_id, target_id, rel_type, properties_json, updated_at) VALUES (?, ?, ?, ?, ?) "
                    "ON CONFLICT(source_id, target_id, rel_type) DO UPDATE SET properties_json=excluded.properties_json, updated_at=excluded.updated_at",
                    (source_id, target_id, rel_type, json.dumps(properties), time.time()),
                )
                conn.commit()
        except Exception as e:
            logger.debug(f"SQLite edge persist notice: {e}")

    def _init_connection(self) -> None:
        """Attempts Bolt driver connection with brief timeout."""
        try:
            from neo4j import GraphDatabase

            # Short timeout to avoid blocking startup if Neo4j is offline
            self._driver = GraphDatabase.driver(
                self.uri,
                auth=(self.user, self.password),
                connection_timeout=1.0,
                max_connection_lifetime=300,
            )
            self._driver.verify_connectivity()
            self._is_connected = True
            logger.info(f"Connected to live Neo4j cluster at {self.uri}")
        except Exception as err:
            self._is_connected = False
            if self._driver:
                try:
                    self._driver.close()
                except Exception:
                    pass
                self._driver = None
            logger.info(
                f"Neo4j offline ({err}); activating high-fidelity in-memory property graph engine."
            )

    @property
    def is_connected(self) -> bool:
        """Returns True if connected to live Neo4j Bolt server."""
        return self._is_connected

    def close(self) -> None:
        """Closes live driver if active."""
        if self._driver:
            try:
                self._driver.close()
            except Exception:
                pass
            self._is_connected = False

    def add_node(self, node_id: str, label: str, properties: Dict[str, Any]) -> None:
        """Adds or updates a node in the graph."""
        clean_props = {k: v for k, v in properties.items() if v is not None}
        clean_props["id"] = node_id
        clean_props["label"] = label

        if self._is_connected and self._driver:
            try:
                query = f"MERGE (n:{label} {{id: $node_id}}) SET n += $props"
                with self._driver.session() as session:
                    session.run(query, node_id=node_id, props=clean_props)
                return
            except Exception as e:
                logger.warning(f"Neo4j live node merge failed: {e}; writing to memory fallback")

        # In-memory graph storage
        self._memory_graph.add_node(node_id, **clean_props)
        self._node_labels[node_id] = label
        self._persist_node_to_sqlite(node_id, label, clean_props)

    def add_edge(
        self,
        source_id: str,
        target_id: str,
        rel_type: str,
        properties: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Creates a directed relationship between two nodes."""
        props = properties or {}
        clean_props = {k: v for k, v in props.items() if v is not None}
        clean_props["type"] = rel_type

        if self._is_connected and self._driver:
            try:
                src_label = self._node_labels.get(source_id, "Node")
                tgt_label = self._node_labels.get(target_id, "Node")
                query = (
                    f"MATCH (a {{id: $src_id}}), (b {{id: $tgt_id}}) "
                    f"MERGE (a)-[r:{rel_type}]->(b) "
                    f"SET r += $props"
                )
                with self._driver.session() as session:
                    session.run(query, src_id=source_id, tgt_id=target_id, props=clean_props)
                return
            except Exception as e:
                logger.warning(f"Neo4j live edge merge failed: {e}; writing to memory fallback")

        # In-memory graph storage
        if not self._memory_graph.has_node(source_id):
            self._memory_graph.add_node(source_id, id=source_id, label="Node")
        if not self._memory_graph.has_node(target_id):
            self._memory_graph.add_node(target_id, id=target_id, label="Node")

        self._memory_graph.add_edge(source_id, target_id, key=rel_type, rel_type=rel_type, **clean_props)
        self._persist_edge_to_sqlite(source_id, target_id, rel_type, clean_props)

    def delete_node(self, node_id: str) -> None:
        """Permanently deletes a node and its attached relationships from graph."""
        if self._is_connected and self._driver:
            try:
                query = "MATCH (n {id: $node_id}) DETACH DELETE n"
                with self._driver.session() as session:
                    session.run(query, node_id=node_id)
            except Exception as e:
                logger.warning(f"Neo4j live node delete failed: {e}")

        # In-memory graph
        if self._memory_graph.has_node(node_id):
            self._memory_graph.remove_node(node_id)
        self._node_labels.pop(node_id, None)

        # SQLite durable tables
        try:
            import sqlite3
            with sqlite3.connect(self._sqlite_path, timeout=3.0) as conn:
                conn.execute("DELETE FROM graph_nodes WHERE id = ?", (node_id,))
                conn.execute("DELETE FROM graph_edges WHERE source_id = ? OR target_id = ?", (node_id, node_id))
                conn.commit()
        except Exception as e:
            logger.debug(f"SQLite graph node delete notice: {e}")

    def execute_cypher(
        self, query: str, parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Executes a Cypher query with live Bolt driver or memory emulation."""
        params = parameters or {}
        if self._is_connected and self._driver:
            try:
                with self._driver.session() as session:
                    result = session.run(query, params)
                    return [record.data() for record in result]
            except Exception as e:
                logger.warning(f"Live Cypher execution error: {e}; querying memory graph")

        return self._emulate_cypher_in_memory(query, params)

    def get_patient_subgraph(
        self, patient_id: str, max_depth: int = 2
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Retrieves all connected nodes and links within max_depth hops of the patient.
        Formatted for direct ingestion into frontend force-directed visualizer.
        """
        if self._is_connected and self._driver:
            try:
                query = (
                    "MATCH path = (p:Patient {id: $patient_id})-[*1..2]-(m) "
                    "WITH collect(path) AS paths "
                    "CALL apoc.convert.toTree(paths) YIELD value "
                    "RETURN value"
                )
                # Fallback to direct path collection if APOC is not loaded
                flat_query = (
                    f"MATCH (p:Patient {{id: $patient_id}})-[r*1..{max_depth}]-(m) "
                    "RETURN p, r, m LIMIT 200"
                )
                with self._driver.session() as session:
                    res = session.run(flat_query, patient_id=patient_id)
                    records = [r.data() for r in res]
                    if records:
                        return self._format_neo4j_records_as_graph(records, patient_id)
            except Exception as e:
                logger.debug(f"Live Cypher get_patient_subgraph fallback to memory: {e}")

        # In-memory graph traversal
        return self._get_memory_subgraph(patient_id, max_depth)

    def _get_memory_subgraph(
        self, patient_id: str, max_depth: int = 2
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Extracts a clean, strictly patient-centric subgraph around patient_id.
        Prevents graph explosion and cross-patient leakage through shared ontology nodes.
        """
        if not self._memory_graph.has_node(patient_id):
            return {"nodes": [], "links": []}

        patient_nodes: Set[str] = {patient_id}
        patient_edges = []

        # 1. Hop 1: Find all edges directly connected to patient_id
        # (Patient)-[:HAS_ENCOUNTER]->(Encounter), (Patient)-[:HAS_REPORT]->(Report),
        # (Patient)-[:HAS_LAB_RESULT]->(Lab), (Patient)-[:DIAGNOSED_WITH]->(Condition)
        hop1_neighbors: Set[str] = set()
        for u, v, key, data in self._memory_graph.edges(keys=True, data=True):
            if u == patient_id:
                hop1_neighbors.add(v)
                patient_edges.append((u, v, key, data))
            elif v == patient_id:
                hop1_neighbors.add(u)
                patient_edges.append((u, v, key, data))

        patient_nodes.update(hop1_neighbors)

        # 2. Hop 2: From patient's encounters, reports, labs, and active conditions,
        # traverse ONLY to their clinical attributes (Medications, Anatomy, Symptoms, Provenance)
        # CRITICAL: Never traverse backwards to other Patients or other patients' encounters/reports!
        if max_depth >= 2:
            hop2_neighbors: Set[str] = set()
            for intermediate in hop1_neighbors:
                inter_label = self._memory_graph.nodes[intermediate].get("label", "")
                if inter_label in ["Patient"]:
                    continue  # Guard against any patient-patient linkage

                # Outward edges from Encounter, Report, Lab, or Condition
                for u, v, key, data in self._memory_graph.out_edges(intermediate, keys=True, data=True):
                    tgt_label = self._memory_graph.nodes[v].get("label", "") if self._memory_graph.has_node(v) else ""
                    # Do not walk to other patients or other patients' reports/encounters
                    if tgt_label not in ["Patient"] and not v.startswith("PT-") and not v.startswith("ENC-"):
                        hop2_neighbors.add(v)
                        patient_edges.append((u, v, key, data))

                # Inward provenance or report links (e.g. (Provenance)-[:HAS_PROVENANCE]->(Report) or vice versa)
                for u, v, key, data in self._memory_graph.in_edges(intermediate, keys=True, data=True):
                    src_label = self._memory_graph.nodes[u].get("label", "") if self._memory_graph.has_node(u) else ""
                    if src_label in ["ProvenanceNode", "LabResult", "Observation"]:
                        hop2_neighbors.add(u)
                        patient_edges.append((u, v, key, data))

            patient_nodes.update(hop2_neighbors)

        # Build clean node list
        nodes_out = []
        for nid in patient_nodes:
            if self._memory_graph.has_node(nid):
                data = dict(self._memory_graph.nodes[nid])
                data["id"] = nid
                data["label"] = data.get("label", self._node_labels.get(nid, "Entity"))
                nodes_out.append(data)

        # Build clean link list without duplicates
        links_out = []
        seen_links = set()
        for u, v, key, data in patient_edges:
            if u in patient_nodes and v in patient_nodes:
                edge_id = f"{u}->{v}->{data.get('rel_type', key)}"
                if edge_id in seen_links:
                    continue
                seen_links.add(edge_id)

                link_entry = {
                    "source": u,
                    "target": v,
                    "type": data.get("rel_type", key),
                    "label": data.get("rel_type", key),
                    "confidence": data.get("confidence", 1.0),
                    "evidence": data.get("evidence", ""),
                    "temporal_status": data.get("temporal_status", "active"),
                    "onset_date": data.get("onset_date"),
                    "resolved_date": data.get("resolved_date"),
                    "valid_from": data.get("valid_from"),
                    "valid_to": data.get("valid_to"),
                    "modality": data.get("modality"),
                }
                for k, val in data.items():
                    if k not in link_entry and k not in ("rel_type",):
                        link_entry[k] = val
                links_out.append(link_entry)

        return {"nodes": nodes_out, "links": links_out}

    def _format_neo4j_records_as_graph(
        self, records: List[Dict[str, Any]], root_id: str
    ) -> Dict[str, List[Dict[str, Any]]]:
        nodes_dict: Dict[str, Dict[str, Any]] = {}
        links: List[Dict[str, Any]] = []

        for row in records:
            p_node = row.get("p")
            m_node = row.get("m")
            rels = row.get("r", [])
            if isinstance(p_node, dict) and "id" in p_node:
                nodes_dict[p_node["id"]] = p_node
            if isinstance(m_node, dict) and "id" in m_node:
                nodes_dict[m_node["id"]] = m_node

            if not isinstance(rels, list):
                rels = [rels]
            for rel in rels:
                if isinstance(rel, dict):
                    links.append({
                        "source": rel.get("start_node", root_id),
                        "target": rel.get("end_node", m_node.get("id") if m_node else ""),
                        "type": rel.get("type", "RELATED_TO"),
                        "label": rel.get("type", "RELATED_TO"),
                    })

        return {"nodes": list(nodes_dict.values()), "links": links}

    def _emulate_cypher_in_memory(
        self, query: str, parameters: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Lightweight Cypher emulation for common clinical read queries.
        Handles MATCH patterns for count, return nodes, and simple edge lookups,
        and accurately respects LIMIT clauses.
        """
        q = query.strip()
        q_upper = q.upper()

        # Extract LIMIT clause if present
        limit_match = re.search(r"\bLIMIT\s+(\d+)\b", q, re.IGNORECASE)
        limit_val = int(limit_match.group(1)) if limit_match else None

        # Handle simple node count queries: MATCH (n) RETURN count(n)
        if "RETURN COUNT(N)" in q_upper or ("COUNT(*)" in q_upper and "-[" not in q):
            count = self._memory_graph.number_of_nodes()
            return [{"count": count, "count(n)": count, "count(*)": count}]

        # Handle relationship count queries: MATCH ()-[r]->() RETURN count(r)
        if ("RETURN COUNT(R)" in q_upper or "COUNT(*)" in q_upper) and "-[" in q:
            count = self._memory_graph.number_of_edges()
            return [{"count": count, "count(r)": count, "count(*)": count}]

        # Handle MATCH (n)-[r]->(m) RETURN n, r, m or RETURN *
        edge_match = re.search(r"MATCH\s*\(([a-zA-Z0-9_]*)(?::([a-zA-Z0-9_]+))?\)\s*-\[([a-zA-Z0-9_]*)(?::([a-zA-Z0-9_]+))?\]->\s*\(([a-zA-Z0-9_]*)(?::([a-zA-Z0-9_]+))?\)", q, re.IGNORECASE)
        if edge_match:
            source_var = edge_match.group(1) or "n"
            source_label = (edge_match.group(2) or "").lower()
            rel_var = edge_match.group(3) or "r"
            rel_type = (edge_match.group(4) or "").upper()
            target_var = edge_match.group(5) or "m"
            target_label = (edge_match.group(6) or "").lower()

            edge_results = []
            for u, v, k, data in self._memory_graph.edges(keys=True, data=True):
                u_data = dict(self._memory_graph.nodes[u])
                u_data["id"] = u
                v_data = dict(self._memory_graph.nodes[v])
                v_data["id"] = v

                if source_label and u_data.get("label", "").lower() != source_label:
                    continue
                if target_label and v_data.get("label", "").lower() != target_label:
                    continue
                actual_rel = data.get("type", "RELATED_TO").upper()
                if rel_type and actual_rel != rel_type:
                    continue

                rel_dict = {"type": actual_rel, "source": u, "target": v, **data}
                edge_results.append({
                    source_var: u_data,
                    rel_var: rel_dict,
                    target_var: v_data,
                    "n": u_data,
                    "r": rel_dict,
                    "m": v_data,
                })
            if limit_val is not None:
                edge_results = edge_results[:limit_val]
            return edge_results

        # Handle MATCH (c:Condition) RETURN c
        label_match = re.search(r"MATCH\s*\(([a-zA-Z0-9_]*):([a-zA-Z0-9_]+)\)", q, re.IGNORECASE)
        if label_match:
            var_name = label_match.group(1) or "n"
            target_label = label_match.group(2).lower()
            results = []
            for nid, data in self._memory_graph.nodes(data=True):
                node_label = data.get("label", "").lower()
                if node_label == target_label:
                    node_copy = dict(data)
                    node_copy["id"] = nid
                    rec = {var_name: node_copy, "n": node_copy, "node": node_copy}
                    results.append(rec)
            if limit_val is not None:
                results = results[:limit_val]
            return results

        # Handle MATCH (n) RETURN n
        match_all = re.search(r"MATCH\s*\(([a-zA-Z0-9_]+)\)\s*RETURN\s+\1", q, re.IGNORECASE)
        if match_all:
            var_name = match_all.group(1)
            results = []
            for nid, data in self._memory_graph.nodes(data=True):
                node_copy = dict(data)
                node_copy["id"] = nid
                rec = {var_name: node_copy, "n": node_copy, "node": node_copy}
                results.append(rec)
            if limit_val is not None:
                results = results[:limit_val]
            return results

        # Default fallback: return all nodes as generic records
        sample_results = []
        max_items = limit_val if limit_val is not None else 50
        for nid, data in list(self._memory_graph.nodes(data=True))[:max_items]:
            sample_results.append({
                "id": nid,
                "label": data.get("label", "Node"),
                "name": data.get("name", nid),
                "properties": data,
            })
        return sample_results

    def get_stats(self) -> Dict[str, Any]:
        """Returns statistics on active graph database and connectivity."""
        if self._is_connected and self._driver:
            try:
                with self._driver.session() as session:
                    n_count = session.run("MATCH (n) RETURN count(n) AS cnt").single()["cnt"]
                    r_count = session.run("MATCH ()-[r]->() RETURN count(r) AS cnt").single()["cnt"]
                    return {
                        "mode": "neo4j_bolt",
                        "connected": True,
                        "uri": self.uri,
                        "node_count": n_count,
                        "relationship_count": r_count,
                        "engine": "Neo4j Enterprise / Community 5.x",
                    }
            except Exception as e:
                logger.warning(f"Failed to fetch Neo4j live stats: {e}")

        return {
            "mode": "air_gapped_in_memory",
            "connected": False,
            "uri": self.uri,
            "node_count": self._memory_graph.number_of_nodes(),
            "relationship_count": self._memory_graph.number_of_edges(),
            "engine": "Air-Gapped Sovereign Property Graph Engine (NetworkX MultiDiGraph)",
        }

    def reset_memory_graph(self) -> None:
        """Clears in-memory graph (useful for test isolation)."""
        self._memory_graph.clear()
        self._node_labels.clear()


# Global singleton instance
_graph_manager: Optional[Neo4jGraphManager] = None


def get_graph_manager() -> Neo4jGraphManager:
    """Returns singleton Neo4jGraphManager instance."""
    global _graph_manager
    if _graph_manager is None:
        _graph_manager = Neo4jGraphManager()
    return _graph_manager
