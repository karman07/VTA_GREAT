import httpx
import asyncio

async def main():
    url = "http://localhost:8000/ingest"
    
    files = {'file': ('test.txt', b'hello world', 'text/plain')}
    data = {
        'teacher_id': 'd2f808b8-34e7-447c-b2ec-65f7fc33864e',
        'collection_name': 'test_collection',
        'file_id': 'test_file_id',
        'file_name': 'test.txt',
        'is_assignment': 'false'
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, data=data, files=files)
        print("Status:", resp.status_code)
        print("Response:", resp.text)

asyncio.run(main())
