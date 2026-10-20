import requests

res = requests.post("http://localhost:8000/query", json={
    "teacher_id": "e4c315f8-d8e9-42b6-b2c1-3277f0938494",
    "collection_name": "test_col",
    "question": "What is MCP?",
    "top_k": 3
})
data = res.json()
ans = data.get("answer", "")
if "\\n" in ans:
    print("YES DOUBLE BACKSLASH")
else:
    print("NO DOUBLE BACKSLASH")
    print("repr:", repr(ans[:100]))
