import gspread
from google.oauth2.service_account import Credentials

# Setup credentials
scopes = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

creds = Credentials.from_service_account_file(
    '/Users/kwangxiong.sim/Documents/other references for claude/gen-lang-client-0889510585-407fa2b0e50e.json',
    scopes=scopes
)

gc = gspread.authorize(creds)

# Open existing spreadsheet
SPREADSHEET_ID = '170ruk_B9l3sLvxYCtMDNgpM6ncxqCyPhyVyuvvmzSXI'
spreadsheet = gc.open_by_key(SPREADSHEET_ID)
print(f"Opened spreadsheet: {spreadsheet.url}")

# Helper to get or create sheet
def get_or_create_sheet(spreadsheet, title, headers):
    try:
        sheet = spreadsheet.worksheet(title)
        print(f"Found existing sheet: {title}")
        # Clear and reset headers
        sheet.clear()
        sheet.append_row(headers)
    except gspread.exceptions.WorksheetNotFound:
        sheet = spreadsheet.add_worksheet(title=title, rows=1000, cols=len(headers) + 5)
        sheet.append_row(headers)
        print(f"Created sheet: {title}")
    return sheet

# Create/update the 4 required sheets
sellers = get_or_create_sheet(spreadsheet, 'Sellers', ['id', 'name', 'createdAt'])
affiliates = get_or_create_sheet(spreadsheet, 'Affiliates', ['id', 'name', 'createdAt'])
slots = get_or_create_sheet(spreadsheet, 'Slots', ['id', 'sellerId', 'sellerName', 'date', 'startTime', 'endTime', 'description', 'createdAt'])
bookings = get_or_create_sheet(spreadsheet, 'Bookings', ['id', 'slotId', 'sellerId', 'sellerName', 'affiliateId', 'affiliateName', 'date', 'startTime', 'endTime', 'bookedAt'])

print("\n" + "="*60)
print("SETUP COMPLETE!")
print("="*60)
print(f"\nSpreadsheet URL:\n{spreadsheet.url}")
print(f"\nSpreadsheet ID:\n{spreadsheet.id}")
print("\n" + "="*60)
print("NEXT STEPS:")
print("="*60)
print("""
1. Open the spreadsheet URL above
2. Go to Extensions > Apps Script
3. Delete any existing code
4. Copy & paste the code from: livestream-booking-backend.gs
5. Save (Ctrl+S)
6. Click Deploy > New deployment
7. Select type: Web app
8. Set:
   - Execute as: Me
   - Who has access: Anyone
9. Click Deploy
10. Copy the Web app URL
11. Update the API_URL in livestream-booking.html (line ~727)
""")
