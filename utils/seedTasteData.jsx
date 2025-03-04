const mongoose = require('mongoose');
const Taste = require('../models/tasteDB.js');

const tasteCategory = [
  "Сладкий",
  "Кислый",
  "Горький",
  "Умами",
  "Терпкий",
  "Ореховый",
  "Пряный",
  "Фруктовый",
  "Цветочный",
  "Травяной",
  "Древесный",
  "Землистый",
  "Жареный",
  "Минеральный",
  "Химический"
];

const tasteSubcategory = {
  Сладкий: ["Медовый", "Карамельный", "Фруктовая сладость", "Молочный"],
  Кислый: ["Цитрусовый", "Ягодный", "Зелёная кислота", "Винный"],
  Горький: ["Лёгкая горечь", "Травяная горечь", "Горечь какао", "Хинин"],
  Умами: ["Бульонный", "Водорослевый", "Сливочный", "Соевый"],
  Терпкий: ["Зелёный чай", "Дубильный", "Кисельно-терпкий"],
  Ореховый: ["Миндальный", "Фундуковый", "Кедровый"],
  Пряный: ["Корица", "Гвоздика", "Перечный", "Имбирный"],
  Фруктовый: ["Цитрусовый", "Косточковый", "Ягодный", "Сушёный фрукт"],
  Цветочный: ["Жасминовый", "Розовый", "Лавандовый"],
  Травяной: ["Мятный", "Эвкалиптовый", "Шалфейный", "Сеновой"],
  Древесный: ["Дубовый", "Кедровый", "Смолистый"],
  Землистый: ["Грибной", "Мшистый", "Свекольный"],
  Жареный: ["Какао", "Жареный орех", "Кофейный", "Поджаренный хлеб"],
  Минеральный: ["Каменный", "Металлический", "Йодистый"],
  Химический: ["Фенольный", "Пластиковый", "Аптечный", "Сероводородный"]
};
const tasteDescriptors = {
  Медовый: ["Цветочный мёд", "Гречишный мёд", "Каштановый мёд"],
  Карамельный: ["Жжёная карамель", "Ириска", "Сливочная карамель"],
  Фруктовая_сладость: ["Спелый манго", "Запечённое яблоко", "Сушёный инжир"],
  Цитрусовый: ["Лимон", "Апельсин", "Мандарин", "Грейпфрут"],
  Ягодный: ["Малина", "Черника", "Клюква", "Смородина"],
  Зелёная_кислота: ["Щавель", "Зелёное яблоко", "Лист смородины"],
  Винный: ["Белое вино", "Красное вино", "Ферментированные ягоды"],
  Лёгкая_горечь: ["Зелёный чай", "Чёрный чай", "Лёгкая полынь"],
  Травяная_горечь: ["Лист одуванчика", "Полынь", "Тонизирующая горечь"],
  Горечь_какао: ["Какао-порошок", "Горький шоколад"],
  Хинин: ["Тоник", "Цитрусовый хинин"],
  Бульонный: ["Костный бульон", "Умами-дрожжи"],
  Водорослевый: ["Нори", "Вакаме", "Ламинария"],
  Сливочный: ["Топлёное молоко", "Крем", "Молочный шоколад"],
  Соевый: ["Соевый соус", "Мисо", "Ферментированные бобы"],
  Миндальный: ["Горький миндаль", "Сладкий миндаль"],
  Фундуковый: ["Жареный фундук", "Свежий фундук"],
  Кедровый: ["Кедровый орех", "Смола кедра"],
  Корица: ["Молотая корица", "Корица в палочках"],
  Гвоздика: ["Сушёная гвоздика", "Эфирное масло гвоздики"],
  Перечный: ["Чёрный перец", "Белый перец", "Розовый перец"],
  Имбирный: ["Свежий имбирь", "Сушёный имбирь", "Карамелизированный имбирь"],
  Жасминовый: ["Свежий жасмин", "Сухой жасмин"],
  Розовый: ["Дамасская роза", "Розовая вода"],
  Лавандовый: ["Сухая лаванда", "Эфирное масло лаванды"],
  Мятный: ["Свежая мята", "Мята перечная"],
  Эвкалиптовый: ["Свежий эвкалипт", "Эвкалиптовое масло"],
  Шалфейный: ["Зелёный шалфей", "Сушёный шалфей"],
  Сеновой: ["Сухое сено", "Трава после дождя"],
  Дубовый: ["Дубовая кора", "Выдержанное в бочке"],
  Кедровый: ["Смола кедра", "Древесина кедра"],
  Смолистый: ["Сосновая смола", "Амбра"],
  Грибной: ["Белый гриб", "Подосиновик", "Сушёные грибы"],
  Мшистый: ["Зелёный мох", "Влажный лес"],
  Свекольный: ["Свежая свёкла", "Запечённая свёкла"],
  Какао: ["Какао-бобы", "Какао-порошок"],
  Жареный_орех: ["Кешью", "Жареный миндаль"],
  Кофейный: ["Жареный кофе", "Эспрессо"],
  Поджаренный_хлеб: ["Тост", "Гренки"],
  Каменный: ["Мокрый камень", "Минеральная вода"],
  Металлический: ["Кровянистый металл", "Железо"],
  Йодистый: ["Йод", "Морская соль"],
  Фенольный: ["Дёготь", "Копчёный запах", "Лак"],
  Пластиковый: ["Плавленый пластик", "Синтетический привкус"],
  Аптечный: ["Лекарственный", "Салициловый"],
  Сероводородный: ["Гнилое яйцо", "Сера"]
};


// Подключаемся к MongoDB
mongoose.connect('mongodb://tea-mongodb:27017/teadb', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(async () => {
    console.log('Connected to MongoDB');

    // Очистим коллекцию перед загрузкой данных
    await Taste.deleteMany({});

    // Формируем и вставляем данные
    const tastes = tasteCategory.map(category => ({
      category,
      subcategories: tasteSubcategory[category].map(subcategory => ({
        name: subcategory,
        descriptors: tasteDescriptors[subcategory] || []
      }))
    }));

    await Taste.insertMany(tastes);

    console.log('Tastes data inserted successfully');

    // Закрываем соединение с базой данных
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('Error connecting to MongoDB:', err);
  });
