// English <-> Sinhala. The app is written in English; when Sinhala is chosen every piece of
// screen text found in this dictionary is swapped (and swapped back for English).
// Bills / receipts are NOT translated (they stay as designed for customers).
// Missing a word? Add it to SI (exact English text -> Sinhala) or PATTERNS below.

const SI = {
  // ---- navigation / shell ----
  'POS': 'POS (විකුණුම්)', 'Orders & Billing': 'ඇණවුම් සහ බිල්පත්', 'Dashboard': 'උපකරණ පුවරුව', 'Kitchen Display': 'මුළුතැන්ගෙය',
  'Menu Management': 'මෙනු කළමනාකරණය', 'Inventory': 'තොග', 'Google Review': 'Google සමාලෝචනය', 'Settings & Security': 'සැකසුම් සහ ආරක්ෂාව',
  'POS System': 'POS පද්ධතිය', 'Sign out': 'ඉවත් වන්න', 'Cashier:': 'අයකැමි:', 'not set': 'සකසා නැත', 'Loading…': 'පූරණය වෙමින්…',
  'Device:': 'උපාංගය:', 'Counter': 'කවුන්ටරය', 'Kitchen': 'මුළුතැන්ගෙය', 'Both': 'දෙකම', 'Dark': 'අඳුරු', 'Light': 'ආලෝක',
  'Tap here to turn on sound alerts': 'ශබ්ද ඇඟවීම් සක්‍රිය කිරීමට මෙතන ඔබන්න',
  'Something went wrong': 'යම් දෙයක් වැරදුණා',
  'If this says a table does not exist, run': 'වගුවක් නැහැ යැයි පෙන්වන්නේ නම්, ධාවනය කරන්න',
  'in Supabase SQL Editor.': 'Supabase SQL Editor හි.',
  // ---- login ----
  'Sign in': 'ඇතුල් වන්න', 'Email': 'විද්‍යුත් තැපෑල', 'Password': 'මුරපදය', 'Code': 'කේතය', 'Verify': 'තහවුරු කරන්න',
  '2-step verification': '2-පියවර සත්‍යාපනය', 'Enter the 6-digit code from your authenticator app': 'ඔබේ authenticator යෙදුමේ ඇති ඉලක්කම් 6 කේතය ඇතුළත් කරන්න',
  'No authenticator found.': 'Authenticator එකක් හමු නොවීය.',
  // ---- POS ----
  'Search items…': 'භාණ්ඩ සොයන්න…', 'All': 'සියල්ල', 'Dine-in': 'ස්ථානයේ', 'Takeaway': 'රැගෙන යාම',
  'Table / Token no.': 'මේස / ටෝකන් අංකය', 'Customer name': 'ගනුදෙනුකරුගේ නම', 'Customer WhatsApp (07XXXXXXXX)': 'ගනුදෙනුකරුගේ WhatsApp (07XXXXXXXX)',
  'Kitchen note (optional)': 'මුළුතැන්ගෙය සඳහා සටහන (අවශ්‍ය නම්)', 'Discount %': 'වට්ටම %', 'Discount LKR': 'වට්ටම රු.',
  'Subtotal': 'උප එකතුව', 'Discount': 'වට්ටම', 'Total': 'මුළු එකතුව', 'Cash': 'මුදල්', 'Card': 'කාඩ්පත', 'Bank Transfer': 'බැංකු මාරුව', 'QR Pay': 'QR ගෙවීම',
  'Cash received (LKR)': 'ලැබුණු මුදල (රු.)', 'Tap items to add to the order': 'ඇණවුමට එක් කිරීමට භාණ්ඩ ඔබන්න', 'Out of stock': 'තොග නැත',
  'No items. Add some in Menu Management.': 'භාණ්ඩ නැත. මෙනු කළමනාකරණයෙන් එක් කරන්න.', 'Extras': 'අමතර (Extras)', 'Quantity': 'ප්‍රමාණය',
  'Cancel': 'අවලංගු', 'Add to order': 'ඇණවුමට එක් කරන්න', 'Send to kitchen': 'මුළුතැන්ගෙයට යවන්න', 'Print kitchen slip': 'මුළුතැන්ගෙය පතිකාව මුද්‍රණය',
  'Print customer bill': 'ගනුදෙනුකරුගේ බිල මුද්‍රණය', 'Not sent to kitchen: saved as served': 'මුළුතැන්ගෙයට නොයවයි: සේවය කළ ලෙස සුරැකේ',
  'Order sent to kitchen': 'ඇණවුම මුළුතැන්ගෙයට යැවුණා', 'Order saved': 'ඇණවුම සුරැකුණා', 'each': 'එකක්',
  'Exact': 'නිවැරදි', 'Less': 'අඩු', 'remove': 'ඉවත් කරන්න', 'more': 'වැඩි',
  // ---- bill popup ----
  'Customer WhatsApp number': 'ගනුදෙනුකරුගේ WhatsApp අංකය', 'Print Bill': 'බිල මුද්‍රණය', 'WhatsApp (with logo picture)': 'WhatsApp (ලාංඡන පින්තූරය සමඟ)',
  'WhatsApp (text)': 'WhatsApp (පෙළ)', 'Kitchen Slip': 'මුළුතැන්ගෙය පතිකාව',
  // ---- orders ----
  "Today's sale": 'අද විකුණුම්', "This month's sale": 'මෙම මාසයේ විකුණුම්', 'Showing': 'පෙන්වන්නේ', 'Dine-in / Takeaway': 'ස්ථානයේ / රැගෙන යාම', 'in this view': 'මෙම දසුනේ',
  'Today': 'අද', 'Month': 'මාසය', 'Pick date': 'දිනයක් තෝරන්න', 'Search bill no / name / phone': 'බිල් අංකය / නම / දුරකථනය සොයන්න',
  'All types': 'සියලු වර්ග', 'All payments': 'සියලු ගෙවීම්', 'Export CSV': 'CSV අපනයනය', 'Bill': 'බිල', 'Date & time': 'දිනය සහ වේලාව', 'Customer': 'ගනුදෙනුකරු',
  'Type': 'වර්ගය', 'Payment': 'ගෙවීම', 'Status': 'තත්ත්වය', 'Total (LKR)': 'එකතුව (රු.)', 'Served': 'සේවය කළා', 'In kitchen': 'මුළුතැන්ගෙයේ',
  'No bills found': 'බිල්පත් හමු නොවීය', 'Nothing to export': 'අපනයනය කිරීමට කිසිවක් නැත', 'Bills': 'බිල්පත්', 'Sales (LKR)': 'විකුණුම් (රු.)',
  // ---- dashboard ----
  'This month': 'මෙම මාසය', 'Average bill (today)': 'සාමාන්‍ය බිල (අද)', 'Pending in kitchen': 'මුළුතැන්ගෙයේ පොරොත්තුවේ',
  'Dine-in vs Takeaway': 'ස්ථානයේ vs රැගෙන යාම', 'Today orders': 'අද ඇණවුම්', 'Today sales': 'අද විකුණුම්', 'Month orders': 'මාස ඇණවුම්', 'Month sales': 'මාස විකුණුම්',
  'Last 7 days': 'පසුගිය දින 7', 'Best selling items': 'වැඩියෙන්ම අලෙවි වන භාණ්ඩ', 'Item': 'භාණ්ඩය', 'Sold': 'අලෙවි', 'Revenue': 'ආදායම', 'Stock left': 'ඉතිරි තොගය',
  'No sales yet': 'තවම විකුණුම් නැත', 'Item stock': 'භාණ්ඩ තොගය', 'In stock': 'තොගයේ', 'Out': 'අවසන්', 'Low': 'අඩුයි', 'OK': 'හරි',
  'No items with stock tracking': 'තොග නිරීක්ෂණය කරන භාණ්ඩ නැත', 'Inventory alerts': 'තොග අවවාද', 'Ingredient': 'අමුද්‍රව්‍යය', 'Left': 'ඉතිරි', 'Alert level': 'අවවාද මට්ටම',
  'All ingredients are above the alert level 👍': 'සියලු අමුද්‍රව්‍ය අවවාද මට්ටමට වඩා ඉහළයි 👍',
  // ---- kitchen ----
  'Test sound': 'ශබ්දය පරීක්ෂා', 'Served today': 'අද සේවය කළ', 'No pending orders. Kitchen is clear ✓': 'පොරොත්තු ඇණවුම් නැත. මුළුතැන්ගෙය හිස් ✓', 'Nothing served yet today': 'අද තවම කිසිවක් සේවය කර නැත',
  'Mark Served': 'සේවය කළා ලෙස සලකුණු කරන්න', 'Print': 'මුද්‍රණය', 'Undo': 'පසුගමනය', 'waiting': 'බලා සිටී', 'Note:': 'සටහන:',
  // ---- menu ----
  'Items': 'භාණ්ඩ', 'Categories': 'වර්ග', 'Add item': 'භාණ්ඩයක් එක් කරන්න', 'Edit item': 'භාණ්ඩය සංස්කරණය', 'Category': 'වර්ගය', 'Price (LKR)': 'මිල (රු.)', 'Stock': 'තොගය',
  'Active': 'සක්‍රිය', 'Hidden': 'සැඟවුණු', 'not tracked': 'නිරීක්ෂණය නැත', '+ Stock': '+ තොගය', 'No items yet': 'තවම භාණ්ඩ නැත', 'Add category': 'වර්ගයක් එක් කරන්න',
  'Edit category': 'වර්ගය සංස්කරණය', 'Order': 'අනුපිළිවෙල', 'No categories yet': 'තවම වර්ග නැත', 'Add extra': 'Extra එකක් එක් කරන්න', 'Edit extra': 'Extra සංස්කරණය',
  'Extra': 'Extra', 'No extras yet': 'තවම Extras නැත', 'Name': 'නම', '— none —': '— නැත —', 'Track stock for this item': 'මෙම භාණ්ඩයේ තොගය නිරීක්ෂණය කරන්න',
  'Stock now': 'දැන් තොගය', 'Low-stock alert at': 'තොග අඩු අවවාදය', 'Allow extras (cheese, egg…) on this item': 'මෙම භාණ්ඩයට Extras (චීස්, බිත්තර…) ඉඩ දෙන්න',
  'Show in POS': 'POS හි පෙන්වන්න', 'Save': 'සුරකින්න', 'Display order (small number shows first)': 'පෙන්වීමේ අනුපිළිවෙල (කුඩා අංකය මුලින්)',
  'Tip: create a category first (Categories tab)': 'ඉඟිය: මුලින් වර්ගයක් සාදන්න (වර්ග tab එක)', 'Extras show up when a bun is added to an order (cheese, egg, sauce…)': 'ඇණවුමට බනිස් එකක් එක් කරන විට Extras පෙන්වයි (චීස්, බිත්තර, සෝස්…)',
  'Saved': 'සුරැකුණා', 'Deleted': 'මකා දැමුණා', 'Stock updated': 'තොගය යාවත්කාලීන විය', 'Please confirm': 'කරුණාකර තහවුරු කරන්න', 'Yes, do it': 'ඔව්, කරන්න',
  // ---- inventory ----
  'Add ingredient': 'අමුද්‍රව්‍යයක් එක් කරන්න', 'Edit ingredient': 'අමුද්‍රව්‍යය සංස්කරණය', 'Unit': 'ඒකකය', 'Alert at': 'අවවාදය', '± Adjust': '± සීරුමාරු',
  'Empty': 'හිස්', 'No ingredients yet': 'තවම අමුද්‍රව්‍ය නැත', 'Inventory updated': 'තොග යාවත්කාලීන විය',
  // ---- review ----
  'Google review link': 'Google සමාලෝචන සබැඳිය', 'Save link': 'සබැඳිය සුරකින්න', 'Open link': 'සබැඳිය විවෘත කරන්න', 'Copy': 'පිටපත්', 'Remove': 'ඉවත් කරන්න',
  'How to get the link': 'සබැඳිය ලබා ගන්නේ කෙසේද', 'Preview of the WhatsApp bill ending': 'WhatsApp බිලේ අවසානයේ පෙරදසුන', 'Review link saved': 'සමාලෝචන සබැඳිය සුරැකුණා',
  // ---- settings ----
  'Counter / Cashier on duty': 'කවුන්ටරය / රාජකාරියේ සිටින අයකැමි', 'Name of the person at the counter now': 'දැන් කවුන්ටරයේ සිටින අයගේ නම', 'Save cashier': 'අයකැමි සුරකින්න',
  'Billing': 'බිල්පත්කරණය', 'Add service charge to new bills by default': 'නව බිල්පත් වලට සේවා ගාස්තුව පෙරනිමියෙන් එක් කරන්න', 'Service charge %': 'සේවා ගාස්තුව %', 'Default discount %': 'පෙරනිමි වට්ටම %',
  'Payment methods': 'ගෙවීම් ක්‍රම', 'Save billing': 'බිල්පත්කරණය සුරකින්න', 'Shop details (printed on bills)': 'වෙළඳසැලේ තොරතුරු (බිල්පත්වල මුද්‍රණය වේ)', 'Shop name': 'වෙළඳසැලේ නම',
  'Tagline': 'සටන් පාඨය', 'Address': 'ලිපිනය', 'Shop phone': 'වෙළඳසැලේ දුරකථනය', 'Shop WhatsApp': 'වෙළඳසැලේ WhatsApp', 'Bill footer message': 'බිලේ අවසාන පණිවුඩය',
  'Save shop details': 'තොරතුරු සුරකින්න', 'Security': 'ආරක්ෂාව', 'Change password': 'මුරපදය වෙනස් කරන්න', 'New password': 'නව මුරපදය', 'Repeat': 'නැවත ඇතුළත් කරන්න',
  '2-step verification is ON': '2-පියවර සත්‍යාපනය සක්‍රියයි', '2-step verification is OFF': '2-පියවර සත්‍යාපනය අක්‍රියයි', 'Turn on': 'සක්‍රිය කරන්න', 'Turn off': 'අක්‍රිය කරන්න',
  'Verify & turn on': 'තහවුරු කර සක්‍රිය කරන්න', 'Adds a second lock: password + a code from your phone.': 'දෙවන අගුලක්: මුරපදය + ඔබේ දුරකථනයේ කේතයක්.',
  'Cashier saved': 'අයකැමි සුරැකුණා', 'Billing settings saved': 'බිල්පත් සැකසුම් සුරැකුණා', 'Shop details saved': 'වෙළඳසැලේ තොරතුරු සුරැකුණා', 'Cashier updated': 'අයකැමි යාවත්කාලීන විය',
  'Cashier can still change service charge / discount on every bill in POS.': 'අයකැමිට තවමත් POS හි සෑම බිලකම සේවා ගාස්තුව / වට්ටම වෙනස් කළ හැක.',
  'Printed on every bill. You can also change it from the top bar.': 'සෑම බිලකම මුද්‍රණය වේ. ඉහළ තීරුවෙන්ද වෙනස් කළ හැක.',
  'Password changed': 'මුරපදය වෙනස් විය', 'Change': 'වෙනස් කරන්න',
  // ---- sentences ----
  "Paste your shop's Google review link here. It is added at the bottom of every bill sent on WhatsApp so customers can rate you. Printed bills do not show it.": 'ඔබේ වෙළඳසැලේ Google සමාලෝචන සබැඳිය මෙහි ඇතුළත් කරන්න. WhatsApp හරහා යවන සෑම බිලක් අවසානයේම එය එක් වේ. මුද්‍රිත බිල්පත්වල එය නොපෙන්වයි.',
  'Open Google Maps and find your business profile (or open the Google Business Profile app).': 'Google Maps විවෘත කර ඔබේ ව්‍යාපාර පැතිකඩ සොයන්න (නැතහොත් Google Business Profile යෙදුම විවෘත කරන්න).',
  'Tap Share review form / Get more reviews.': 'Share review form / Get more reviews ඔබන්න.',
  'Copy the link (it looks like https://g.page/r/…/review) and paste it above.': 'සබැඳිය පිටපත් කරන්න (https://g.page/r/…/review වගේ) ඉහත ඇතුළත් කරන්න.',
  'Track raw materials (buns, cheese, chicken…). Use Adjust to add new stock or record usage / waste.': 'අමුද්‍රව්‍ය (බනිස්, චීස්, කුකුල් මස්…) නිරීක්ෂණය කරන්න. නව තොග එක් කිරීමට හෝ භාවිතය / අපතේ යාම සටහන් කිරීමට “සීරුමාරු” භාවිතා කරන්න.',
  'Adjust': 'සීරුමාරු',
  // ---- common ----
  'Edit': 'සංස්කරණය', 'Delete': 'මකන්න', 'Close': 'වසන්න', 'Yes': 'ඔව්', 'No': 'නැත', 'Loading': 'පූරණය වෙමින්',
  'New day started: screens refreshed': 'අලුත් දවසක් ඇරඹුණා: තිර නැවුම් කළා',
};

Object.assign(SI, {
  'Refunded items': 'ආපසු දුන් අයිතම', 'Qty refunded': 'ආපසු දුන් ගණන', 'Added back': 'තොගයට එකතු කළා', 'Reason': 'හේතුව', 'Add stock': 'තොගය එක් කරන්න', '± Use / waste': '± භාවිතය / නාස්තිය', 'Cost per unit': 'ඒකකයක පිරිවැය', 'Stock value': 'තොගයේ වටිනාකම', 'not set': 'සකසා නැත',
  'Quantity bought': 'මිලදී ගත් ප්‍රමාණය', 'Total price paid (LKR)': 'ගෙවූ මුළු මිල (රු.)', 'Add to stock': 'තොගයට එක් කරන්න', 'Stock added': 'තොගය එක් කළා',
  'Cost (LKR)': 'පිරිවැය (රු.)', 'Profit': 'ලාභය', 'Cost of this item': 'මෙම අයිතමයේ පිරිවැය', 'Add ingredient': 'අමුද්‍රව්‍යයක් එක් කරන්න', 'I will type the cost myself': 'පිරිවැය මම අතින් ඇතුළත් කරමි',
  'Cost of one item (LKR)': 'එක් අයිතමයක පිරිවැය (රු.)', 'Cost to you (LKR)': 'ඔබට වන පිරිවැය (රු.)', 'Profit from these bills': 'මෙම බිල්පත් වලින් ලාභය', 'Purchase history': 'මිලදී ගැනීම් ඉතිහාසය',
  'Bought': 'මිලදී ගත්', 'Paid': 'ගෙවූ', 'Add ingredients in Inventory first': 'මුලින් Inventory හි අමුද්‍රව්‍ය එක් කරන්න',  'Bills in the list below': 'පහළ ලැයිස්තුවේ බිල්පත්', 'Back to today': 'අදට ආපසු', 'Days with refunds': 'ආපසු දීම් තිබූ දවස්', 'No refunds today 👍': 'අද ආපසු දීම් නැත 👍', 'No refunds on this day': 'මේ දවසේ ආපසු දීම් නැත', '✔ Added back': '✔ තොගයට එකතු කළා', '✖ Not added back': '✖ තොගයට එකතු කළේ නැත', 'No refunds 👍': 'ආපසු දීම් නැත 👍',
  'Refund': 'මුදල් ආපසු', 'Change type / payment': 'වර්ගය / ගෙවීම වෙනස් කරන්න', '↗ Open as kitchen screen': '↗ කුස්සි තිරයක් ලෙස විවෘත කරන්න', 'Refund everything left': 'ඉතිරි සියල්ල ආපසු දෙන්න',
  'Reason (optional)': 'හේතුව (අවශ්‍ය නම්)', 'Put the refunded items back in stock': 'ආපසු දුන් අයිතම තොගයට එකතු කරන්න', 'Admin approval needed': 'පරිපාලක අනුමැතිය අවශ්‍යයි',
  'Recently served': 'මෑතදී සේවය කළ', 'Edited': 'වෙනස් කළා', 'Part refund': 'කොටසක් ආපසු', 'Refunded': 'ආපසු දුන්',
  'How to send': 'යවන ආකාරය', 'Send to everyone automatically': 'හැමෝටම ස්වයංක්‍රීයව යවන්න', 'Send one by one': 'එකිනෙකා වෙන වෙනම යවන්න', 'Who gets it': 'කාටද යවන්නේ',
  'Everyone': 'හැමෝම', 'Recent customers': 'මෑත පාරිභෝගිකයන්', 'Regular customers': 'නිතිපතා පාරිභෝගිකයන්', 'Retry failed': 'අසාර්ථක ඒවා නැවත යවන්න',
  'Send promotion': 'ප්‍රවර්ධනයක් යවන්න', 'Promos': 'ප්‍රවර්ධන', 'Receives': 'ලැබේ', 'Stopped': 'නවත්වා ඇත', 'Message': 'පණිවිඩය',
  'Photo / poster (optional)': 'ඡායාරූපය / පෝස්ටරය (අවශ්‍ය නම්)', 'Send to': 'යවන්නේ', 'All customers': 'සියලු පාරිභෝගිකයන්', 'Start sending': 'යැවීම අරඹන්න',
  'Skip': 'මඟ හරින්න', 'Stop (continue later)': 'නවත්වන්න (පසුව දිගටම)', 'Unfinished promotion': 'නොනිම් ප්‍රවර්ධනය', 'Continue': 'දිගටම', 'Discard': 'අත්හරින්න',
  'Waiting for the admin': 'පරිපාලක එනතුරු', 'Waiting…': 'බලාපොරොත්තුවෙන්…', 'Allow': 'අවසර දෙන්න', 'Deny': 'ප්‍රතික්ෂේප කරන්න', 'The admin said no.': 'පරිපාලක ප්‍රතික්ෂේප කළා.',
  'No answer from the admin. Try again.': 'පරිපාලකගෙන් පිළිතුරක් නැහැ. නැවත උත්සාහ කරන්න.', 'Cancel': 'අවලංගු',
  'Devices & cashiers': 'උපාංග සහ අයකැමියන්', 'Admin only': 'පරිපාලකයාට පමණි', 'Admin email': 'පරිපාලක ඊමේල්', 'Admin password': 'පරිපාලක මුරපදය', 'Unlock': 'විවෘත කරන්න',
  'Wrong admin email or password': 'පරිපාලක ඊමේල් හෝ මුරපදය වැරදියි', 'Waiting for admin approval': 'පරිපාලක අනුමැතිය බලාපොරොත්තුවෙන්', 'Check again': 'නැවත බලන්න',
  'Name this device': 'මේ උපාංගයට නමක් දෙන්න', 'Device name': 'උපාංගයේ නම', 'Continue': 'ඉදිරියට', 'Approve': 'අනුමත කරන්න', 'Remove': 'ඉවත් කරන්න', 'Approved': 'අනුමතයි', 'Waiting': 'බලාපොරොත්තුවෙන්',
  'This device': 'මේ උපාංගය', 'Admin': 'පරිපාලක', 'Device': 'උපාංගය', 'Cashier on duty': 'රාජකාරියේ සිටින අයකැමි', 'Last seen': 'අන්තිමට දුටුවේ', 'Back to sign in': 'පිවිසුමට ආපසු',
  'Who is at this counter?': 'මේ කවුන්ටරයේ ඉන්නේ කවුද?', 'Cashier name (this device only)': 'කැෂියර් නම (මේ උපාංගයට පමණි)', 'Cashier saved for this device': 'මේ උපාංගයට කැෂියර් සුරැකුණා',
  'Customers': 'පාරිභෝගිකයෝ', 'Token': 'ටෝකන්', 'Table no. (optional)': 'මේස අංකය (අවශ්‍ය නම්)',
  'Visits': 'පැමිණීම්', 'Total spent (LKR)': 'මුළු වියදම (LKR)', 'Last visit': 'අන්තිම පැමිණීම', 'Search name / phone': 'නම / දුරකථන සොයන්න',
  'No customers yet': 'තවම පාරිභෝගිකයෝ නැත',
});

// Text that contains numbers / names. [regex, replacement]
const PATTERNS = [
  [/^(\d+) customers$/, 'පාරිභෝගිකයන් $1'],
  [/^Returning customer: (.*)$/, 'නැවත පැමිණි පාරිභෝගිකයා: $1'],
  [/^Place Order · (.*)$/, 'ඇණවුම තබන්න · $1'],
  [/^Service charge \((.*)\)$/, 'සේවා ගාස්තුව ($1)'],
  [/^Stock: (\d+)$/, 'තොගය: $1'],
  [/^(.*) each$/, '$1 බැගින්'],
  [/^Balance to give: (.*)$/, 'ආපසු දිය යුතු: $1'],
  [/^Short by (.*)$/, 'අඩුයි: $1'],
  [/^Items \((\d+)\)$/, 'භාණ්ඩ ($1)'],
  [/^Categories \((\d+)\)$/, 'වර්ග ($1)'],
  [/^Extras \/ Add-ons \((\d+)\)$/, 'Extras / Add-ons ($1)'],
  [/^(\d+) bills$/, 'බිල්පත් $1'],
  [/^(\d+) bills · avg (.*)$/, 'බිල්පත් $1 · සාමාන්‍ය $2'],
  [/^(\d+) bills · average per bill (.*)$/, 'බිල්පත් $1 · බිල්පතක සාමාන්‍යය $2'],
  [/^profit (.*)$/, 'ලාභය $1'],
  [/^(\d+)% of sales · sales (.*) − cost (.*)$/, 'විකුණුම් වලින් $1% · විකුණුම් $2 − පිරිවැය $3'],
  [/^sales (.*) − cost (.*)$/, 'විකුණුම් $1 − පිරිවැය $2'],
  [/^(\d+) older bills? without cost are not counted$/, 'පිරිවැය නොමැති පරණ බිල්පත් $1ක් ගණන් ගන්නේ නැත'],
  [/^⚠ (\d+) bills? (?:have|has) items with no cost set$/, '⚠ පිරිවැය සකසා නැති අයිතම ඇති බිල්පත් $1ක්'],
  [/^(\d+) orders$/, 'ඇණවුම් $1'],
  [/^(\d+) min$/, 'මිනිත්තු $1'],
  [/^(\d+) running low$/, '$1 ක් අඩුයි'],
  [/^Daily sales for (.*) \((\d+) days\)$/, '$1 දෛනික විකුණුම් (දින $2)'],
  [/^New order (MB-\d+) · (.*)$/, 'නව ඇණවුමක් $1 · $2'],
  [/^Order (MB-\d+) is served ✓$/, 'ඇණවුම $1 සේවය කළා ✓'],
  [/^(MB-\d+) marked as served ✓$/, '$1 සේවය කළා ලෙස සලකුණු කළා ✓'],
  [/^(MB-\d+) moved back to the kitchen$/, '$1 නැවත මුළුතැන්ගෙයට යැවුණා'],
  [/^Order placed · Bill (MB-\d+)$/, 'ඇණවුම තැබුවා · බිල $1'],
  [/^Bill (MB-\d+)$/, 'බිල $1'],
  [/^Only (\d+) left in stock for (.*)$/, '$2 සඳහා තොගයේ ඇත්තේ $1 යි'],
  [/^(.*) is out of stock$/, '$1 තොගයේ නැත'],
  [/^Add stock · (.*)$/, 'තොගය එක් කරන්න · $1'],
  [/^Adjust · (.*)$/, 'සීරුමාරු · $1'],
  [/^Quantity received \(current stock: (\d+)\)\. Use a minus number to remove\.$/, 'ලැබුණු ප්‍රමාණය (වත්මන් තොගය: $1). අඩු කිරීමට සෘණ අංකයක් භාවිතා කරන්න.'],
  [/^Cash received is less than the total \(short (.*)\)$/, 'ලැබුණු මුදල මුළු එකතුවට වඩා අඩුයි (අඩු: $1)'],
  [/^Could not save order: (.*)$/, 'ඇණවුම සුරැකීමට නොහැකි විය: $1'],
  [/^(.*) · Dine-in$/, '$1 · ස්ථානයේ'],
];
const FIX = PATTERNS;

const SKIP = '.receipt, #print-area, .bill-preview, [data-noi18n], input, textarea, script, style';
let lang = 'en';
try { lang = localStorage.getItem('mb_lang') === 'si' ? 'si' : 'en'; } catch { /* ignore */ }
export const getLang = () => lang;

function tr(text) {
  const t = text.trim();
  if (!t) return null;
  if (Object.prototype.hasOwnProperty.call(SI, t)) return SI[t];
  for (const [re, rep] of FIX) if (re.test(t)) return t.replace(re, rep);
  return null;
}
function doText(node) {
  const p = node.parentElement;
  if (!p || p.closest(SKIP)) return;
  const cur = node.nodeValue;
  if (node.__tr !== undefined && cur === node.__tr) { if (lang === 'en') { node.nodeValue = node.__orig; node.__tr = undefined; } return; }
  // fresh text (new or re-written by the app)
  node.__orig = cur; node.__tr = undefined;
  if (lang !== 'si') return;
  const out = tr(cur);
  if (out) { const lead = cur.match(/^\s*/)[0], trail = cur.match(/\s*$/)[0]; node.__tr = lead + out + trail; node.nodeValue = node.__tr; }
}
const ATTRS = ['placeholder', 'title', 'aria-label'];
function doAttrs(el) {
  if (el.closest && el.closest(SKIP.replace('input, textarea, ', ''))) return;
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const key = '__o_' + a, cur = el.getAttribute(a);
    if (el[key] !== undefined && el[key + 't'] === cur) { if (lang === 'en') { el.setAttribute(a, el[key]); el[key + 't'] = undefined; el[key] = undefined; } continue; }
    el[key] = cur; el[key + 't'] = undefined;
    if (lang !== 'si') continue;
    const out = tr(cur);
    if (out) { el[key + 't'] = out; el.setAttribute(a, out); }
  }
}
function walk(root) {
  if (root.nodeType === 3) return doText(root);
  if (root.nodeType !== 1) return;
  if (root.matches && root.matches('script,style')) return;
  doAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
}

let obs;
export function applyAll() { walk(document.body); }
export function initI18n() {
  document.documentElement.lang = lang === 'si' ? 'si' : 'en';
  obs = new MutationObserver(muts => {
    obs.disconnect();
    try {
      for (const m of muts) {
        if (m.type === 'childList') m.addedNodes.forEach(n => walk(n));
        else if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
      }
    } finally { obs.observe(document.body, CFG); }
  });
  const CFG = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };
  obs.observe(document.body, CFG);
  applyAll();
}
export function setLang(l) {
  lang = l === 'si' ? 'si' : 'en';
  try { localStorage.setItem('mb_lang', lang); } catch { /* ignore */ }
  document.documentElement.lang = lang;
  if (obs) { obs.disconnect(); }
  applyAll();
  if (obs) obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
export const t = s => (lang === 'si' ? (tr(s) || s) : s);
