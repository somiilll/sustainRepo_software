from modules.contact_sales.router import _confirmation_email


def test_confirmation_email_is_branded_and_escapes_the_recipient_name():
    email = _confirmation_email("Somil <Goyal>")

    assert "sustainrepo-logo.png" in email
    assert "Explore SustainRepo resources" in email
    assert "Somil &lt;Goyal&gt;" in email
    assert "24 business hours" in email


def test_confirmation_email_contains_exact_resources_cta_url():
    email = _confirmation_email("Test User")

    assert 'href="https://sustainrepo.com/resources"' in email


def test_confirmation_email_escapes_quotes_in_recipient_name():
    email = _confirmation_email('A \"quoted\" recipient')

    assert "A &quot;quoted&quot; recipient" in email