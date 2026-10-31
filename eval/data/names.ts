// Labelled (group member, registration) pairs drawn from patterns seen in Indian
// WhatsApp groups. `same` is the ground truth. Phones are optional; when given they
// only expose the last 4 digits to the model, as in production.

export interface NamePair {
  group: string;
  registered: string;
  payer?: string;
  groupPhone?: string;
  regPhone?: string;
  same: boolean;
  note?: string;
}

export const NAME_PAIRS: NamePair[] = [
  // Same person
  { group: "Ravi K", registered: "Ravi Kumar", same: true, note: "initial" },
  { group: "Kumar Ravi", registered: "Ravi Kumar", same: true, note: "surname first" },
  { group: "Seenu", registered: "Srinivas Rao", same: true, note: "nickname" },
  { group: "Seenu 302", registered: "Srinivasa Rao", payer: "SRINIVASA RAO K", same: true, note: "nickname + flat" },
  { group: "Lakshmi Iyer", registered: "Laxmi Iyer", same: true, note: "transliteration" },
  { group: "Mohd Irfan", registered: "Mohammed Irfan", same: true, note: "abbreviation" },
  { group: "Md. Salim", registered: "Mohammad Saleem", same: true, note: "abbreviation + spelling" },
  { group: "Chandu", registered: "Chandrasekhar", same: true, note: "nickname" },
  { group: "Venky", registered: "Venkatesh Naidu", same: true, note: "nickname" },
  { group: "Satya", registered: "Satyanarayana Murthy", same: true, note: "short form" },
  { group: "Sharma ji", registered: "R Sharma", payer: "RAKESH SHARMA", same: true, note: "honorific" },
  { group: "Anil 302", registered: "Anil Varma", same: true, note: "flat number" },
  { group: "Hema Latha", registered: "Hemalatha", same: true, note: "split vs joined" },
  { group: "Dr. Sita", registered: "Sita Reddy", same: true, note: "title" },
  { group: "Meena Aunty", registered: "Meena Krishnan", same: true, note: "relation suffix" },
  { group: "Swathi M", registered: "Swathi Murthy", same: true, note: "initial" },
  { group: "Kiran B", registered: "Kiran Babu", same: true },
  { group: "Ramesh Gupta", registered: "R Gupta", same: true, note: "initial first" },
  { group: "Bala", registered: "Balasubramanian", same: true, note: "short form" },
  { group: "Raghu", registered: "Raghavendra Rao", same: true, note: "short form" },
  { group: "Vijji", registered: "Vijaya Lakshmi", same: true, note: "nickname" },
  { group: "Jaggu", registered: "Jagadeesh", same: true, note: "nickname" },
  { group: "Sunny", registered: "Sunil Kumar", groupPhone: "+919848011111", regPhone: "+919848011111", same: true, note: "nickname + phone" },
  { group: "Puja Agarwal", registered: "Pooja Agarwal", same: true, note: "spelling" },
  { group: "Shiva", registered: "Siva Prasad", same: true, note: "spelling + short" },
  { group: "Krishna (B-204)", registered: "Krishna Mohan", same: true, note: "flat" },
  { group: "Fatima S", registered: "Fathima Shaikh", same: true, note: "spelling + initial" },
  { group: "AV", registered: "Anand Varma", payer: "ANAND VARMA", same: true, note: "initials only" },
  { group: "Mahesh Babu Garu", registered: "Mahesh Babu", same: true, note: "Telugu honorific" },
  { group: "Thiru", registered: "Thirumalesh", same: true, note: "short form" },
  // Different people
  { group: "Priya Sharma", registered: "Priya Verma", same: false, note: "same first name" },
  { group: "Shalini Rao", registered: "Srinivas Rao", same: false, note: "same surname" },
  { group: "Ravi Kumar", registered: "Ravi Teja", same: false, note: "same first name" },
  { group: "Anil 302", registered: "Anil 405", same: false, note: "different flats" },
  { group: "Sita Reddy", registered: "Gita Reddy", same: false, note: "one letter apart" },
  { group: "Mohan", registered: "Mohana Priya", same: false, note: "prefix, different person" },
  { group: "Kiran Kumar", registered: "Kiran Bedi", same: false },
  { group: "Lakshmi Iyer", registered: "Lakshmi Narayan", same: false },
  { group: "Suresh", registered: "Ramesh", same: false, note: "rhyming names" },
  { group: "Arjun Mehta", registered: "Arjun Kapoor", same: false },
  { group: "Priya", registered: "Priya", groupPhone: "+919000011111", regPhone: "+919000022222", same: false, note: "same name, different phone" },
  { group: "Raju", registered: "Rajesh Khanna", same: false, note: "ambiguous nickname" },
  { group: "Venkat 101", registered: "Venkat 202", same: false, note: "different flats" },
  { group: "Deepa", registered: "Deepak", same: false, note: "gendered pair" },
  { group: "Naveen", registered: "Praveen", same: false },
  { group: "Kavya Rao", registered: "Kavitha Rao", same: false },
  { group: "Harish", registered: "Hari Prasad", same: false, note: "prefix" },
  { group: "Nandini Rao", registered: "Kavya Rao", same: false },
  { group: "Sai Kiran", registered: "Sai Krishna", same: false },
  { group: "Ganesh Sweets", registered: "Ganesh Iyer", same: false, note: "business vs person" },
];
