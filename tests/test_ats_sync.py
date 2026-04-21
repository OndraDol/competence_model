"""Unit tests for ats_sync.py — mocked HTTP, no network."""

import json
import unittest
from unittest import mock

import ats_sync


class RetryDelayTests(unittest.TestCase):
    def test_schedule_event_uses_full_retry_schedule(self):
        self.assertEqual(ats_sync.get_retry_delay_minutes("schedule"), (0, 30, 60))

    def test_workflow_dispatch_uses_full_retry_schedule(self):
        self.assertEqual(ats_sync.get_retry_delay_minutes("workflow_dispatch"), (0, 30, 60))

    def test_other_event_is_single_attempt(self):
        self.assertEqual(ats_sync.get_retry_delay_minutes("push"), (0,))
        self.assertEqual(ats_sync.get_retry_delay_minutes(None), (0,))
        self.assertEqual(ats_sync.get_retry_delay_minutes(""), (0,))


class DegradationGuardTests(unittest.TestCase):
    def setUp(self):
        ats_sync.FETCH_DIAGNOSTICS.clear()

    def test_empty_dataset_flags_abort(self):
        reasons = ats_sync.get_degradation_reasons([], previous_count=818)
        self.assertEqual(reasons, ["Datacruit competence_models dataset is empty"])

    def test_below_minimum_flags(self):
        records = [{"result_id": i} for i in range(50)]
        reasons = ats_sync.get_degradation_reasons(records, previous_count=None)
        self.assertTrue(any("below minimum" in r for r in reasons))

    def test_large_drop_flags(self):
        records = [{"result_id": i} for i in range(300)]
        reasons = ats_sync.get_degradation_reasons(records, previous_count=800)
        self.assertTrue(any("dropped from 800 to 300" in r for r in reasons))

    def test_json_repair_flag_propagates(self):
        records = [{"result_id": i} for i in range(500)]
        ats_sync.FETCH_DIAGNOSTICS[ats_sync.DATASET_NAME] = {"jsonRepairApplied": True}
        reasons = ats_sync.get_degradation_reasons(records, previous_count=500)
        self.assertIn("Datacruit JSON repair was required for competence_models dataset", reasons)

    def test_healthy_dataset_is_silent(self):
        records = [{"result_id": i} for i in range(800)]
        reasons = ats_sync.get_degradation_reasons(records, previous_count=818)
        self.assertEqual(reasons, [])


class FetchDataJsonRepairTests(unittest.TestCase):
    def setUp(self):
        ats_sync.FETCH_DIAGNOSTICS.clear()

    def _mock_response(self, *, ok=True, status_code=200, body='[{"x":1}]'):
        response = mock.MagicMock()
        response.ok = ok
        response.status_code = status_code
        response.reason = "OK" if ok else "ERR"
        response.url = "https://app.datacruit.com/public/export_json?dataset=competence_models"
        response.text = body
        response.headers = {"Content-Type": "application/json"}
        if ok:
            response.json.side_effect = lambda: json.loads(body)
        else:
            response.raise_for_status.side_effect = Exception(f"HTTP {status_code}")
        return response

    @mock.patch.object(ats_sync, "requests")
    def test_successful_fetch_returns_parsed_list(self, mock_requests):
        mock_requests.get.return_value = self._mock_response(body='[{"result_id":1}]')
        records = ats_sync.fetch_data("competence_models")
        self.assertEqual(records, [{"result_id": 1}])
        self.assertFalse(ats_sync.FETCH_DIAGNOSTICS["competence_models"]["jsonRepairApplied"])

    @mock.patch.object(ats_sync, "requests")
    def test_json_repair_on_truncated_payload(self, mock_requests):
        truncated = '[{"result_id":1},{"result_id":2}TRAILING_GARBAGE'
        response = mock.MagicMock()
        response.ok = True
        response.text = truncated
        response.headers = {"Content-Type": "application/json"}
        response.json.side_effect = ValueError("trailing garbage")
        mock_requests.get.return_value = response

        records = ats_sync.fetch_data("competence_models")
        self.assertEqual(records, [{"result_id": 1}, {"result_id": 2}])
        diag = ats_sync.FETCH_DIAGNOSTICS["competence_models"]
        self.assertTrue(diag["jsonRepairApplied"])
        self.assertTrue(diag["usedTrailingTrim"])


class NormalizeResultTests(unittest.TestCase):
    def test_key_is_string_result_id(self):
        key, rec = ats_sync.normalize_result({"result_id": 42, "foo": "bar"})
        self.assertEqual(key, "42")
        self.assertEqual(rec["foo"], "bar")

    def test_missing_result_id_raises_sync_abort(self):
        with self.assertRaises(ats_sync.SyncAbort):
            ats_sync.normalize_result({"foo": "bar"})


if __name__ == "__main__":
    unittest.main()
