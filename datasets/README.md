# Datasets

## English Words Dictionary

- **Nguồn:** [dwyl/english-words](https://github.com/dwyl/english-words) (MIT License)
- **Số lượng:** ~370,000 từ tiếng Anh (đã lọc chỉ giữ từ alphabetic, 2+ ký tự)
- **Mục đích:** Kiểm tra từ người dùng nhập có phải từ tiếng Anh hợp lệ không
- **Bao gồm:** Tất cả word forms — động từ quá khứ (ran, played), thêm -ing (running), số nhiều (dogs), v.v.

### Files

| File | Mô tả | Kích thước |
|------|--------|-----------|
| `words_dictionary.json` | Bộ gốc từ dwyl (key-value) | 6.5 MB |
| `en_words.txt` | Danh sách từ (1 từ/dòng) - nhẹ nhất | 3.7 MB |
| `en_words.json` | Mảng JSON tất cả từ | 4.4 MB |

### Cách sử dụng trong project

```javascript
// Load dataset và kiểm tra từ
const validator = await EnWordValidator.init();
validator.isEnglish('running');  // true
validator.isEnglish('xyzabc');  // false
validator.suggest('runing');    // ['running', 'runing'] (gợi ý sửa)
```
