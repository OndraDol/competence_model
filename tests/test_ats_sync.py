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
        self.assertIn(
            "Datacruit JSON repair was required for competence_models dataset",
            reasons,
        )

    def test_healthy_dataset_is_silent(self):
        records = [{"result_id": i} for i in range(800)]
        reasons = ats_sync.get_degradation_reasons(records, previous_count=818)
        self.assertEqual(reasons, [])


class FetchDataJsonRepairTests(unittest.TestCase):
    def setUp(self):
        ats_sync.FETCH_DIAGNOSTICS.clear()

    @mock.patch.object(ats_sync, "requests")
    def test_successful_fetch_returns_parsed_list(self, mock_requests):
        response = mock.MagicMock()
        response.ok = True
        response.text = '[{"result_id":1}]'
        response.headers = {"Content-Type": "application/json"}
        response.json.return_value = [{"result_id": 1}]
        mock_requests.get.return_value = response

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


class EncryptionRoundTripTests(unittest.TestCase):
    def _sample_records(self):
        return [
            {
                "result_id": 1,
                "candidate_fullname": "Kotouček Tomáš",
                "competences": [{"competence_id": 1, "points": 8}],
                "total_points": 58,
            },
            {
                "result_id": 2,
                "candidate_fullname": "Jana Nováková",
                "competences": [{"competence_id": 1, "points": 9}],
                "total_points": 61,
            },
        ]

    def _sample_meta(self):
        return {
            "syncedAt": "2026-04-21T07:00:03Z",
            "datacruitFetchedAt": "2026-04-21T07:00:01Z",
            "recordCount": 2,
            "jsonRepairApplied": False,
        }

    def test_encrypt_then_decrypt_yields_original_payload(self):
        password = "very-strong-password-123!"
        records = self._sample_records()
        meta = self._sample_meta()
        blob = ats_sync.encrypt_payload(password, records, meta)
        restored = ats_sync.decrypt_payload(password, blob)
        self.assertEqual(restored["records"], records)
        self.assertEqual(restored["meta"], meta)

    def test_wrong_password_raises(self):
        blob = ats_sync.encrypt_payload("correct", self._sample_records(), self._sample_meta())
        with self.assertRaises(Exception):
            ats_sync.decrypt_payload("wrong", blob)

    def test_blob_fields_present_and_unencrypted_meta_exposed(self):
        meta = self._sample_meta()
        blob = ats_sync.encrypt_payload("pwd", self._sample_records(), meta)
        for key in ("v", "algo", "iter", "salt", "iv", "ciphertext"):
            self.assertIn(key, blob)
        self.assertEqual(blob["v"], 1)
        self.assertEqual(blob["iter"], ats_sync.PBKDF2_ITERATIONS)
        self.assertEqual(blob["syncedAt"], meta["syncedAt"])
        self.assertEqual(blob["recordCount"], meta["recordCount"])

    def test_two_encryptions_produce_different_ciphertext(self):
        records = self._sample_records()
        meta = self._sample_meta()
        a = ats_sync.encrypt_payload("pwd", records, meta)
        b = ats_sync.encrypt_payload("pwd", records, meta)
        self.assertNotEqual(a["salt"], b["salt"])
        self.assertNotEqual(a["iv"], b["iv"])
        self.assertNotEqual(a["ciphertext"], b["ciphertext"])


if __name__ == "__main__":
    unittest.main()
