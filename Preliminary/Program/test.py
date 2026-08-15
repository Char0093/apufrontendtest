import os
import warnings

from dotenv import load_dotenv
from google import genai
from PIL import Image

warnings.filterwarnings("ignore", category=FutureWarning)

load_dotenv()
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

image = Image.open(r"C:\Users\USER 01\OneDrive\桌面\图片\屏幕快照\Screenshot 2026-05-12 104232.png")

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=["Extract the namelist of participants and arrange in ascending alphabetical order:", image],
)

print(response.text)