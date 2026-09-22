import unittest

from add_clip import add_clip, german_sort_key, normalize_name, parse_categories, slugify, youtube_id


class AddClipTest(unittest.TestCase):
    def test_normalizes_animal_names(self):
        self.assertEqual(normalize_name("  Red   FOX  "), "red fox")
        self.assertEqual(slugify("Rød Panda"), "rd-panda")

    def test_parses_categories(self):
        self.assertEqual(parse_categories(" Bauernhof , Haustiere , Bauernhof "), ["Bauernhof", "Haustiere"])
        self.assertEqual(parse_categories(["Zoo", " Wildtiere "]), ["Zoo", "Wildtiere"])

    def test_reads_supported_youtube_urls(self):
        self.assertEqual(youtube_id("https://www.youtube.com/shorts/0dbu5Q3l-yM"), "0dbu5Q3l-yM")
        self.assertEqual(youtube_id("https://youtu.be/0dbu5Q3l-yM"), "0dbu5Q3l-yM")

    def test_creates_animal_and_appends_to_existing_animal(self):
        catalog = {"animals": []}
        add_clip(
            catalog,
            " Sea Lion ",
            "https://youtu.be/0dbu5Q3l-yM",
            " Seelöwe ",
            "Zoo, Wildtiere",
        )
        add_clip(
            catalog,
            "sea lion",
            "https://youtu.be/oN7axlCqiG4",
            categories=" Meerestiere ",
        )

        self.assertEqual(len(catalog["animals"]), 1)
        self.assertEqual(catalog["animals"][0]["name"], "sea lion")
        self.assertEqual(catalog["animals"][0]["id"], "sea-lion")
        self.assertEqual(catalog["animals"][0]["nameDe"], "Seelöwe")
        self.assertEqual(catalog["animals"][0]["categories"], ["Zoo", "Wildtiere", "Meerestiere"])
        self.assertEqual(len(catalog["animals"][0]["sources"]), 2)

    def test_requires_a_german_name_for_a_new_animal(self):
        with self.assertRaisesRegex(ValueError, "needs a German name"):
            add_clip({"animals": []}, "lion", "https://youtu.be/0dbu5Q3l-yM")

    def test_sorts_by_folded_german_name(self):
        catalog = {"animals": []}
        add_clip(catalog, "bison", "https://youtu.be/0dbu5Q3l-yM", "Bison")
        add_clip(catalog, "bear", "https://youtu.be/oN7axlCqiG4", "Bär")

        self.assertEqual([animal["nameDe"] for animal in catalog["animals"]], ["Bär", "Bison"])
        self.assertEqual(german_sort_key({"nameDe": "Löwe"}), "lowe")

    def test_rejects_duplicate_video(self):
        catalog = {"animals": []}
        add_clip(catalog, "lion", "https://youtu.be/0dbu5Q3l-yM", "Löwe")
        with self.assertRaisesRegex(ValueError, "already in the catalog"):
            add_clip(catalog, "seal", "https://youtu.be/0dbu5Q3l-yM", "Seehund")


if __name__ == "__main__":
    unittest.main()
