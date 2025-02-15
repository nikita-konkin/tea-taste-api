const mongoose = require('mongoose');

// Схема дескрипторов (для подкатегорий)
const descriptorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  descriptors: {
    type: [String], // Массив строк для описания
    required: true
  }
});

// Схема для самой категории аромата
const tasteSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true
  },
  subcategories: {
    type: [descriptorSchema], // Массив подкатегорий для каждой категории
    required: true
  }
});

// Модель для аромата
// const Aroma = mongoose.model('Aroma', aromaSchema);

// module.exports = Aroma;
module.exports = mongoose.model("tasteDB", tasteSchema);