import unittest
from worker import validate_request

class RequestTests(unittest.TestCase):
    def test_rejects_unlisted_voice_and_overlong_input(self):
        for change in [{"voiceId": "../../bad"}, {"text": "x"*601}, {"speed": float("nan")}, {"speed": 10}, {"text": "   "}]:
            with self.assertRaises(ValueError):
                validate_request({"id":"test", "voiceId":"aiden", "text":"Hello", "speed":1, **change})
    def test_normalizes_text_without_accepting_arbitrary_model_paths(self):
        request = validate_request({"id":"test", "voiceId":"aiden", "text":" Hello ", "speed":1, "model":"/bad"})
        self.assertEqual(request, {"id":"test", "voiceId":"aiden", "text":"Hello", "speed":1})

if __name__ == "__main__": unittest.main()
