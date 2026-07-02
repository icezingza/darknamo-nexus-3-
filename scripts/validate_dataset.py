import json
import statistics
import sys

def analyze_jsonl(file_path):
    total_lines = 0
    valid_records = 0
    errors = []

    user_lengths = []
    assistant_lengths = []

    print(f"[*] กำลังตรวจสอบไฟล์: {file_path}...\n")

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                total_lines += 1
                try:
                    data = json.loads(line)
                    messages = data.get("messages", [])

                    if not messages:
                        errors.append(f"บรรทัด {line_num}: ไม่พบอาร์เรย์ 'messages'")
                        continue

                    roles = [msg.get("role") for msg in messages]

                    # ตรวจสอบว่ามีทั้ง User และ Assistant ครบถ้วนหรือไม่
                    if "user" not in roles or "assistant" not in roles:
                        errors.append(f"บรรทัด {line_num}: จับคู่ไม่ครบ (ขาด user หรือ assistant)")
                        continue

                    # เก็บสถิติความยาวของข้อความ
                    for msg in messages:
                        content = msg.get("content", "")
                        if msg.get("role") == "user":
                            user_lengths.append(len(content))
                        elif msg.get("role") == "assistant":
                            assistant_lengths.append(len(content))

                    valid_records += 1

                except json.JSONDecodeError:
                    errors.append(f"บรรทัด {line_num}: โครงสร้าง JSON ไม่ถูกต้อง (Decode Error)")

        # --- สรุปผลรายงาน ---
        print("=========================================")
        print("    📊 NAMO JSONL DATA VALIDATION 📊    ")
        print("=========================================")
        print(f"บรรทัดทั้งหมดที่สแกน: {total_lines}")
        print(f"✅ จำนวนคู่สนทนาที่สมบูรณ์: {valid_records}")
        print(f"❌ จำนวนบรรทัดที่พบ Error: {len(errors)}")
        print("-----------------------------------------")

        if valid_records > 0:
            print("📈 สถิติความยาวข้อมูล (Character Count):")
            print(f" - ความยาวคำถาม (User) เฉลี่ย:     {statistics.mean(user_lengths):.2f} ตัวอักษร")
            print(f" - ความยาวคำตอบ (Assistant) เฉลี่ย: {statistics.mean(assistant_lengths):.2f} ตัวอักษร")
            print(f" - คำตอบที่ยาวที่สุดของ AI:         {max(assistant_lengths)} ตัวอักษร")

        if errors:
            print("\n⚠️ รายละเอียด Error (สูงสุด 5 รายการแรก):")
            for err in errors[:5]:
                print(f"  - {err}")
            if len(errors) > 5:
                print(f"  ... และพบ Error อื่นๆ อีก {len(errors) - 5} รายการ")

        print("=========================================\n")

        # ประเมินความพร้อม
        if valid_records >= 100 and len(errors) == 0:
            print("🚀 สถานะ: ยอดเยี่ยม! ข้อมูลสะอาดและมีปริมาณมากพอสำหรับการ Fine-tune เฟสแรก")
        elif valid_records > 0 and len(errors) == 0:
            print("⏳ สถานะ: ข้อมูลสะอาด แต่ปริมาณยังน้อยไปนิด (แนะนำให้เก็บให้ถึง 100 คู่ขึ้นไป)")
        else:
            print("🛑 สถานะ: ไม่ผ่าน! กรุณาแก้ไข Error ก่อนนำไปเทรนโมเดล")

    except FileNotFoundError:
        print(f"❌ Error: ไม่พบไฟล์ชื่อ '{file_path}' กรุณาตรวจสอบชื่อและตำแหน่งไฟล์")

if __name__ == "__main__":
    # Usage: python scripts/validate_dataset.py [path/to/dataset.jsonl]
    # Defaults to dataset.jsonl in the current directory if no argument is given.
    file_name = sys.argv[1] if len(sys.argv) > 1 else "dataset.jsonl"
    analyze_jsonl(file_name)
