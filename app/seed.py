"""Deterministic demo seed: no LLM calls. Persona + ~30 facts + 15 questions."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import Edge, BenchmarkQuestion, Node, utcnow
from app.hashlog import append_entry


def _dt(s: str) -> datetime:
    return datetime.fromisoformat(s)


# (subject, relation, object, valid_from, valid_to, node_types, clusters, source_text)
_PEOPLE = "person"
_PLACE = "place"
_TOPIC = "topic"
_EVENT = "event"
_DECISION = "decision"

RAW_FACTS: list[tuple] = [
    # --- relationships (chain 1: dating Rahul -> Mohan) ---
    ("Aisha", "dating", "Rahul", "2023-01-10", None,
     {"subject": _PEOPLE, "object": _PEOPLE}, {"subject": "relationships", "object": "relationships"},
     "Aisha started dating Rahul on 2023-01-10."),
    ("Aisha", "dating", "Mohan", "2024-06-01", None,
     {"subject": _PEOPLE, "object": _PEOPLE}, {"subject": "relationships", "object": "relationships"},
     "Since 2024-06-01 Aisha has been dating Mohan."),
    ("Aisha", "friend_of", "Ben", "2023-02-01", None,
     {"subject": _PEOPLE, "object": _PEOPLE}, {"subject": "relationships", "object": "relationships"},
     "Aisha has been friends with Ben since February 2023."),
    ("Aisha", "sibling_of", "Omar", "1998-05-01", None,
     {"subject": _PEOPLE, "object": _PEOPLE}, {"subject": "relationships", "object": "relationships"},
     "Omar is Aisha's older brother."),
    # --- places (chain 2: lives_in Dubai -> Taipei) ---
    ("Aisha", "lives_in", "Dubai", "2023-03-01", None,
     {"subject": _PEOPLE, "object": _PLACE}, {"subject": "places", "object": "places"},
     "Aisha moved to Dubai for work in March 2023."),
    ("Aisha", "lives_in", "Taipei", "2025-02-01", None,
     {"subject": _PEOPLE, "object": _PLACE}, {"subject": "places", "object": "places"},
     "Aisha relocated to Taipei on 2025-02-01."),
    ("Omar", "lives_in", "Dubai", "2020-01-01", None,
     {"subject": _PEOPLE, "object": _PLACE}, {"subject": "places", "object": "places"},
     "Omar has lived in Dubai since 2020."),
    ("Aisha", "visited", "Kyoto", "2024-11-01", "2024-11-10",
     {"subject": _PEOPLE, "object": _PLACE}, {"subject": "places", "object": "places"},
     "Aisha visited Kyoto in early November 2024."),
    ("Aisha", "visited", "Seoul", "2025-05-01", "2025-05-10",
     {"subject": _PEOPLE, "object": _PLACE}, {"subject": "places", "object": "places"},
     "Aisha took a trip to Seoul in May 2025."),
    # --- work (chain 3: works_at Acme -> Nimbus Labs) ---
    ("Aisha", "works_at", "Acme", "2023-03-01", None,
     {"subject": _PEOPLE, "object": _PLACE}, {"subject": "work", "object": "work"},
     "Aisha joined Acme as a product designer in March 2023."),
    ("Aisha", "works_at", "Nimbus Labs", "2025-03-01", None,
     {"subject": _PEOPLE, "object": _PLACE}, {"subject": "work", "object": "work"},
     "Aisha started at Nimbus Labs on 2025-03-01."),
    ("Mohan", "works_at", "DataBeam", "2024-01-01", None,
     {"subject": _PEOPLE, "object": _PLACE}, {"subject": "work", "object": "work"},
     "Mohan has been an engineer at DataBeam since January 2024."),
    ("Rahul", "works_at", "Freelance", "2023-10-01", None,
     {"subject": _PEOPLE, "object": _PLACE}, {"subject": "work", "object": "work"},
     "Rahul went freelance in October 2023."),
    # --- education (chain 4: studies_at TU Berlin -> done) ---
    ("Rahul", "studies_at", "TU Berlin", "2019-09-01", "2023-08-31",
     {"subject": _PEOPLE, "object": _PLACE}, {"subject": "work", "object": "work"},
     "Rahul studied computer science at TU Berlin until August 2023."),
    ("Aisha", "studied_at", "Design School", "2019-09-01", "2023-01-31",
     {"subject": _PEOPLE, "object": _PLACE}, {"subject": "work", "object": "work"},
     "Aisha graduated from Design School in January 2023."),
    # --- hobbies ---
    ("Aisha", "enjoys", "photography", "2022-06-01", None,
     {"subject": _PEOPLE, "object": _TOPIC}, {"subject": "hobbies", "object": "hobbies"},
     "Aisha loves photography, especially street photography."),
    ("Aisha", "enjoys", "tennis", "2023-04-01", None,
     {"subject": _PEOPLE, "object": _TOPIC}, {"subject": "hobbies", "object": "hobbies"},
     "Aisha plays tennis on weekends."),
    ("Aisha", "enjoys", "hiking", "2023-08-01", None,
     {"subject": _PEOPLE, "object": _TOPIC}, {"subject": "hobbies", "object": "hobbies"},
     "Aisha enjoys hiking in the mountains."),
    ("Mohan", "enjoys", "chess", "2021-01-01", None,
     {"subject": _PEOPLE, "object": _TOPIC}, {"subject": "hobbies", "object": "hobbies"},
     "Mohan is a keen chess player."),
    ("Rahul", "enjoys", "bouldering", "2023-11-01", None,
     {"subject": _PEOPLE, "object": _TOPIC}, {"subject": "hobbies", "object": "hobbies"},
     "Rahul took up bouldering in late 2023."),
    # --- topics & events ---
    ("Aisha", "interested_in", "AI", "2024-01-01", None,
     {"subject": _PEOPLE, "object": _TOPIC}, {"subject": "other", "object": "other"},
     "Aisha became interested in AI tools for designers in 2024."),
    ("Aisha", "interested_in", "sustainable design", "2023-05-01", None,
     {"subject": _PEOPLE, "object": _TOPIC}, {"subject": "other", "object": "other"},
     "Aisha cares about sustainable design."),
    ("Mohan", "interested_in", "startups", "2024-06-01", None,
     {"subject": _PEOPLE, "object": _TOPIC}, {"subject": "other", "object": "other"},
     "Mohan dreams of founding a startup."),
    ("Aisha", "met_at", "TechConf 2024", "2024-09-12", "2024-09-14",
     {"subject": _PEOPLE, "object": _EVENT}, {"subject": "other", "object": "other"},
     "Aisha attended TechConf 2024 in September."),
    ("Aisha", "adopted", "Miso", "2024-03-15", None,
     {"subject": _PEOPLE, "object": _TOPIC}, {"subject": "other", "object": "other"},
     "Aisha adopted a cat named Miso in March 2024."),
    # --- decisions ---
    ("Aisha", "planned", "Career Switch 2025", "2025-01-01", None,
     {"subject": _PEOPLE, "object": _DECISION}, {"subject": "work", "object": "other"},
     "Aisha decided in January 2025 to switch careers into AI product design."),
    ("Aisha", "planned", "Learn Mandarin", "2025-02-15", None,
     {"subject": _PEOPLE, "object": _DECISION}, {"subject": "other", "object": "other"},
     "After moving to Taipei, Aisha decided to learn Mandarin."),
    ("Rahul", "planned", "Freelance Leap 2023", "2023-10-01", None,
     {"subject": _PEOPLE, "object": _DECISION}, {"subject": "work", "object": "other"},
     "Rahul decided to go freelance in October 2023."),
    # --- extra relationship texture ---
    ("Mohan", "lives_in", "Taipei", "2024-06-01", None,
     {"subject": _PEOPLE, "object": _PLACE}, {"subject": "places", "object": "places"},
     "Mohan has lived in Taipei since mid-2024."),
    ("Ben", "lives_in", "Dubai", "2022-08-01", None,
     {"subject": _PEOPLE, "object": _PLACE}, {"subject": "places", "object": "places"},
     "Ben has been in Dubai since August 2022."),
    ("Ben", "works_at", "Acme", "2022-08-01", None,
     {"subject": _PEOPLE, "object": _PLACE}, {"subject": "work", "object": "work"},
     "Ben works at Acme as a backend engineer."),
    ("Aisha", "collaborates_with", "Ben", "2024-02-01", None,
     {"subject": _PEOPLE, "object": _PEOPLE}, {"subject": "work", "object": "work"},
     "Aisha and Ben collaborate on design-system work at Acme."),
]

# Supersession chains wired explicitly: old fact closed by the newer one.
# (relation, subject, old_object, new_object) -> old.superseded_by = new.id
SUPERSEDE_CHAINS = [
    ("dating", "Aisha", "Rahul", "Mohan"),
    ("lives_in", "Aisha", "Dubai", "Taipei"),
    ("works_at", "Aisha", "Acme", "Nimbus Labs"),
]

SEED_QUESTIONS: list[tuple[str, str]] = [
    ("Who is Aisha dating?", "Mohan"),
    ("Who did Aisha use to date before Mohan?", "Rahul"),
    ("Where does Aisha live?", "Taipei"),
    ("Where did Aisha live in 2023?", "Dubai"),
    ("Where did Aisha live before Taipei?", "Dubai"),
    ("Where does Aisha work?", "Nimbus Labs"),
    ("Who used to work at Acme?", "Aisha"),
    ("Where did Aisha work before Nimbus Labs?", "Acme"),
    ("What does Aisha enjoy doing on weekends?", "tennis"),
    ("What are Aisha's hobbies?", "photography"),
    ("Who is Aisha dating that works at DataBeam?", "Mohan"),
    ("What did Aisha decide to do after moving to Taipei?", "Learn Mandarin"),
    ("Who is Aisha's brother?", "Omar"),
    ("Where does Omar live?", "Dubai"),
    ("What pet does Aisha have?", "Miso"),
]


def seed_db(session: Session) -> dict:
    """Wipe and load deterministic demo data. Returns counts."""
    from app.db import Base, engine
    from sqlalchemy import text as sa_text

    session.execute(sa_text("PRAGMA foreign_keys=OFF"))
    session.commit()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session.execute(sa_text("PRAGMA foreign_keys=ON"))

    nodes: dict[str, Node] = {}
    edges: list[Edge] = []

    def upsert(label: str, ntype: str, cluster: str) -> Node:
        key = label.lower()
        if key not in nodes:
            n = Node(label=label, type=ntype, cluster=cluster)
            session.add(n)
            session.flush()  # assign id before edges reference it
            nodes[key] = n
        else:
            if nodes[key].type == "topic" and ntype != "topic":
                nodes[key].type = ntype
            if nodes[key].cluster == "other" and cluster != "other":
                nodes[key].cluster = cluster
        return nodes[key]

    for subject, relation, obj, vf, vt, ntypes, clusters, text in RAW_FACTS:
        s = upsert(subject, ntypes["subject"], clusters["subject"])
        o = upsert(obj, ntypes["object"], clusters["object"])
        e = Edge(
            source_id=s.id,
            target_id=o.id,
            relation=relation,
            valid_from=_dt(vf),
            valid_to=_dt(vt) if vt else None,
            status="current",
            source_text=text,
        )
        session.add(e)
        edges.append(e)
    session.flush()

    # wire supersession chains
    superseded = 0
    for relation, subject, old_obj, new_obj in SUPERSEDE_CHAINS:
        old = next(
            e for e in edges
            if e.relation == relation
            and nodes[old_obj.lower()].id == e.target_id
            and nodes[subject.lower()].id == e.source_id
        )
        new = next(
            e for e in edges
            if e.relation == relation
            and nodes[new_obj.lower()].id == e.target_id
            and nodes[subject.lower()].id == e.source_id
        )
        old.valid_to = new.valid_from
        old.status = "superseded"
        old.superseded_by = new.id
        superseded += 1

    for question, expected in SEED_QUESTIONS:
        session.add(BenchmarkQuestion(question=question, expected_answer=expected))

    append_entry(
        session,
        "seed",
        {
            "nodes": len(nodes),
            "edges": len(edges),
            "superseded": superseded,
            "questions": len(SEED_QUESTIONS),
        },
    )
    session.commit()

    return {
        "nodes": len(nodes),
        "edges": len(edges),
        "superseded": superseded,
        "questions": len(SEED_QUESTIONS),
    }
