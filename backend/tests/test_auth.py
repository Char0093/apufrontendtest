import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import auth as auth_api_module
from app.core.auth import create_app_token
from app.database.session import Base, get_db
from app.main import app
from app.models.employee import Employee

GOOGLE_CLAIMS = {
    "email": "new.judge@gmail.com",
    "name": "New Judge",
    "aud": "test-client-id",
    "email_verified": "true",
}

client = TestClient(app, base_url="http://localhost", raise_server_exceptions=False)


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        app.dependency_overrides.pop(get_db, None)


def test_me_accepts_signed_app_jwt(db_session):
    employee = Employee(
        name="OAuth User",
        email="oauth.user@example.com",
        title="Security Reviewer",
        is_management=False,
    )
    db_session.add(employee)
    db_session.commit()
    db_session.refresh(employee)

    token, _ = create_app_token(employee)

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["email"] == "oauth.user@example.com"
    assert response.json()["name"] == "OAuth User"


def test_me_rejects_invalid_bearer_token():
    response = client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-token"})

    assert response.status_code == 401


def test_google_login_matches_existing_employee_by_email_without_selection(db_session, monkeypatch):
    db_session.add(Employee(name="Sarah Park", email="new.judge@gmail.com", title="Product Lead"))
    db_session.commit()
    monkeypatch.setattr(auth_api_module, "_verify_google_id_token", lambda credential: GOOGLE_CLAIMS)

    response = client.post("/auth/google", json={"credential": "fake-credential"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["user"]["name"] == "Sarah Park"


def test_google_login_matches_existing_employee_by_name_without_selection(db_session, monkeypatch):
    db_session.add(Employee(name="New Judge", email="new.judge@other-domain.example", title="Product Lead"))
    db_session.commit()
    monkeypatch.setattr(auth_api_module, "_verify_google_id_token", lambda credential: GOOGLE_CLAIMS)

    response = client.post("/auth/google", json={"credential": "fake-credential"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["user"]["email"] == "new.judge@gmail.com"


def test_google_login_needs_selection_when_no_employee_matches(db_session, monkeypatch):
    db_session.add(Employee(name="Sarah Park", email="sarah.park@corporatebrain.demo", title="Product Lead"))
    db_session.commit()
    monkeypatch.setattr(auth_api_module, "_verify_google_id_token", lambda credential: GOOGLE_CLAIMS)

    response = client.post("/auth/google", json={"credential": "fake-credential"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "needs_selection"
    assert body["google_name"] == "New Judge"
    assert {opt["name"] for opt in body["options"]} == {"Sarah Park"}
    assert body["claim_token"]


def test_google_login_excludes_prior_unmatched_accounts_from_the_picker(db_session, monkeypatch):
    db_session.add(Employee(name="Sarah Park", email="sarah.park@corporatebrain.demo", title="Product Lead"))
    db_session.add(Employee(name="Some Stranger", email="stranger@gmail.com", title="Google OAuth User"))
    db_session.commit()
    monkeypatch.setattr(auth_api_module, "_verify_google_id_token", lambda credential: GOOGLE_CLAIMS)

    response = client.post("/auth/google", json={"credential": "fake-credential"})

    assert {opt["name"] for opt in response.json()["options"]} == {"Sarah Park"}


def test_claim_identity_attaches_google_email_to_chosen_employee(db_session, monkeypatch):
    sarah = Employee(name="Sarah Park", email="sarah.park@corporatebrain.demo", title="Product Lead")
    db_session.add(sarah)
    db_session.commit()
    db_session.refresh(sarah)
    monkeypatch.setattr(auth_api_module, "_verify_google_id_token", lambda credential: GOOGLE_CLAIMS)
    selection = client.post("/auth/google", json={"credential": "fake-credential"}).json()

    response = client.post(
        "/auth/google/claim",
        json={"claim_token": selection["claim_token"], "employee_id": sarah.id},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["user"]["id"] == sarah.id
    assert body["user"]["name"] == "Sarah Park"
    db_session.refresh(sarah)
    assert sarah.email == "new.judge@gmail.com"


def test_claim_identity_with_no_selection_creates_new_employee(db_session, monkeypatch):
    db_session.add(Employee(name="Sarah Park", email="sarah.park@corporatebrain.demo", title="Product Lead"))
    db_session.commit()
    monkeypatch.setattr(auth_api_module, "_verify_google_id_token", lambda credential: GOOGLE_CLAIMS)
    selection = client.post("/auth/google", json={"credential": "fake-credential"}).json()

    response = client.post(
        "/auth/google/claim",
        json={"claim_token": selection["claim_token"], "employee_id": None},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["user"]["name"] == "New Judge"
    assert body["user"]["email"] == "new.judge@gmail.com"


def test_claim_identity_rejects_invalid_token(db_session):
    response = client.post("/auth/google/claim", json={"claim_token": "not-a-real-token", "employee_id": None})

    assert response.status_code == 401


def test_claim_identity_rejects_unknown_employee_id(db_session, monkeypatch):
    db_session.add(Employee(name="Sarah Park", email="sarah.park@corporatebrain.demo", title="Product Lead"))
    db_session.commit()
    monkeypatch.setattr(auth_api_module, "_verify_google_id_token", lambda credential: GOOGLE_CLAIMS)
    selection = client.post("/auth/google", json={"credential": "fake-credential"}).json()

    response = client.post(
        "/auth/google/claim",
        json={"claim_token": selection["claim_token"], "employee_id": "does-not-exist"},
    )

    assert response.status_code == 404
